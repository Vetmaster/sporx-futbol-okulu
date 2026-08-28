-- Customer acquisition and reviewed subscription-payment flow.
-- The application form itself is written only by a controlled Edge Function;
-- anonymous clients do not receive direct database write permission.

create table if not exists public.school_applications (
  id uuid primary key default gen_random_uuid(),
  school_name text not null check (char_length(btrim(school_name)) between 2 and 120),
  city text not null check (char_length(btrim(city)) between 2 and 80),
  district text not null check (char_length(btrim(district)) between 2 and 80),
  applicant_name text not null check (char_length(btrim(applicant_name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 7 and 30),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  note text,
  status text not null default 'PENDING' check (status in ('PENDING', 'INFO_REQUESTED', 'APPROVED', 'REJECTED')),
  internal_note text,
  customer_message text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_school_id uuid unique references public.schools(id) on delete set null,
  approved_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists school_applications_one_open_email
  on public.school_applications (email)
  where status in ('PENDING', 'INFO_REQUESTED');
create index if not exists school_applications_status_created_idx
  on public.school_applications (status, created_at desc);

create trigger school_applications_set_updated_at
before update on public.school_applications
for each row execute function public.set_updated_at();

alter table public.school_applications enable row level security;
revoke all on public.school_applications from public, anon, authenticated;
grant select, update on public.school_applications to authenticated;

create policy "platform super admins manage school applications"
on public.school_applications for all to authenticated
using (public.is_platform_super_admin())
with check (public.is_platform_super_admin());

create table if not exists public.school_onboardings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid unique not null references public.school_applications(id) on delete cascade,
  status text not null default 'PENDING_CHOICE' check (status in ('PENDING_CHOICE', 'TRIAL_STARTED', 'PAYMENT_PENDING', 'COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger school_onboardings_set_updated_at
before update on public.school_onboardings
for each row execute function public.set_updated_at();

alter table public.school_onboardings enable row level security;
revoke all on public.school_onboardings from public, anon, authenticated;
grant select on public.school_onboardings to authenticated;
create policy "users view their school onboarding"
on public.school_onboardings for select to authenticated
using (applicant_user_id = auth.uid() or public.is_platform_super_admin());

create table if not exists public.school_subscription_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  plan_code text not null check (plan_code in ('standard', 'premium', 'pro')),
  billing_period text not null check (billing_period in ('monthly', 'quarterly', 'yearly', 'trial')),
  amount numeric not null default 0 check (amount >= 0),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  status text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'REJECTED', 'TRIAL')),
  source text not null default 'customer_payment' check (source in ('customer_payment', 'manual', 'trial')),
  payment_report_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, starts_on, ends_on, plan_code)
);

create index if not exists school_subscription_periods_school_dates_idx
  on public.school_subscription_periods (school_id, starts_on desc, ends_on desc);
create index if not exists school_subscription_periods_status_start_idx
  on public.school_subscription_periods (status, starts_on);

create trigger school_subscription_periods_set_updated_at
before update on public.school_subscription_periods
for each row execute function public.set_updated_at();

create table if not exists public.subscription_payment_reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  period_id uuid unique references public.school_subscription_periods(id) on delete cascade,
  reported_by uuid not null references auth.users(id) on delete restrict,
  payment_method text not null default 'transfer' check (payment_method in ('transfer')),
  amount numeric not null check (amount >= 0),
  status text not null default 'PENDING_REVIEW' check (status in ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  payer_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.school_subscription_periods
  add constraint school_subscription_periods_payment_report_fkey
  foreign key (payment_report_id) references public.subscription_payment_reports(id) on delete set null;

create index if not exists subscription_payment_reports_status_created_idx
  on public.subscription_payment_reports (status, created_at desc);
create index if not exists subscription_payment_reports_school_idx
  on public.subscription_payment_reports (school_id, created_at desc);

create trigger subscription_payment_reports_set_updated_at
before update on public.subscription_payment_reports
for each row execute function public.set_updated_at();

alter table public.school_subscription_periods enable row level security;
alter table public.subscription_payment_reports enable row level security;
revoke all on public.school_subscription_periods from public, anon, authenticated;
revoke all on public.subscription_payment_reports from public, anon, authenticated;
grant select on public.school_subscription_periods, public.subscription_payment_reports to authenticated;
create policy "members view own school subscription periods"
on public.school_subscription_periods for select to authenticated
using (public.is_platform_super_admin() or exists (
  select 1 from public.school_user_memberships membership
  where membership.user_id = auth.uid() and membership.school_id = school_subscription_periods.school_id
));
create policy "members view own school payment reports"
on public.subscription_payment_reports for select to authenticated
using (public.is_platform_super_admin() or exists (
  select 1 from public.school_user_memberships membership
  where membership.user_id = auth.uid() and membership.school_id = subscription_payment_reports.school_id
));

-- This RPC is deliberately service-role only. The approval Edge Function is
-- responsible for authenticating the reviewing Super Admin before calling it.
create or replace function public.approve_school_application_from_service(
  target_application_id uuid,
  applicant_user_id uuid,
  school_slug text,
  actor_user_id uuid
)
returns table (school_id uuid, onboarding_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  application_row public.school_applications%rowtype;
  created_school public.schools%rowtype;
  created_onboarding public.school_onboardings%rowtype;
  normalized_slug text := lower(btrim(school_slug));
begin
  select * into application_row from public.school_applications
  where id = target_application_id for update;
  if application_row.id is null then raise exception 'Başvuru bulunamadı'; end if;
  if application_row.status = 'APPROVED' and application_row.approved_school_id is not null then
    return query select application_row.approved_school_id, application_row.id;
    return;
  end if;
  if application_row.status not in ('PENDING', 'INFO_REQUESTED') then
    raise exception 'Bu başvuru onaylanamaz';
  end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Geçerli bir okul kodu oluşturulamadı';
  end if;

  insert into public.schools (name, slug, monthly_fee_amount, subscription_status)
  values (application_row.school_name, normalized_slug, 1500, 'stopped')
  returning * into created_school;

  insert into public.training_groups (school_id, name, sort_order)
  select created_school.id, group_row.name, group_row.sort_order
  from (values ('Saat 09:00', 1), ('Saat 10:00', 2), ('Saat 11:00', 3), ('Saat 12:00', 4), ('U11', 5), ('U12', 6), ('U13', 7), ('U14', 8)) as group_row(name, sort_order);

  insert into public.school_user_memberships (user_id, school_id, full_name, role)
  values (applicant_user_id, created_school.id, application_row.applicant_name, 'admin')
  on conflict (user_id, school_id) do update set full_name = excluded.full_name, role = 'admin', updated_at = now();

  insert into public.profiles (id, school_id, full_name, role)
  values (applicant_user_id, created_school.id, application_row.applicant_name, 'admin')
  on conflict (id) do update set school_id = excluded.school_id, full_name = excluded.full_name, role = 'admin', updated_at = now()
  where public.profiles.role <> 'super_admin';

  insert into public.access_requests (user_id, school_id, email, full_name, requested_role, status, reviewed_by, reviewed_at)
  values (applicant_user_id, created_school.id, application_row.email, application_row.applicant_name, 'admin', 'approved', actor_user_id, now())
  on conflict (user_id, school_id) do update set status = 'approved', reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;

  insert into public.school_onboardings (school_id, applicant_user_id, application_id)
  values (created_school.id, applicant_user_id, application_row.id)
  returning * into created_onboarding;

  update public.school_applications
  set status = 'APPROVED', reviewed_by = actor_user_id, reviewed_at = now(), approved_school_id = created_school.id, approved_user_id = applicant_user_id
  where id = application_row.id;

  return query select created_school.id, created_onboarding.id;
end;
$$;
revoke all on function public.approve_school_application_from_service(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.approve_school_application_from_service(uuid, uuid, text, uuid) to service_role;

create or replace function public.review_school_application(
  target_application_id uuid,
  next_status text,
  customer_note text default null,
  private_note text default null
)
returns public.school_applications
language plpgsql security definer set search_path = public as $$
declare updated_application public.school_applications%rowtype;
begin
  if not public.is_platform_super_admin() then raise exception 'Bu işlem için Süper Admin yetkisi gereklidir'; end if;
  if next_status not in ('INFO_REQUESTED', 'REJECTED') then raise exception 'Geçersiz başvuru işlemi'; end if;
  update public.school_applications
  set status = next_status, customer_message = nullif(btrim(customer_note), ''), internal_note = nullif(btrim(private_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
  where id = target_application_id and status in ('PENDING', 'INFO_REQUESTED')
  returning * into updated_application;
  if updated_application.id is null then raise exception 'Başvuru bulunamadı veya işlem tamamlanmış'; end if;
  return updated_application;
end;
$$;
revoke all on function public.review_school_application(uuid, text, text, text) from public;
grant execute on function public.review_school_application(uuid, text, text, text) to authenticated;

create or replace function public.start_school_trial()
returns public.school_onboardings
language plpgsql security definer set search_path = public as $$
declare onboarding public.school_onboardings%rowtype;
declare trial_start date := current_date;
declare trial_end date := (current_date + interval '14 days')::date;
begin
  select * into onboarding from public.school_onboardings
  where applicant_user_id = auth.uid() and status = 'PENDING_CHOICE'
  order by created_at desc limit 1 for update;
  if onboarding.school_id is null then raise exception 'Başlatılabilecek deneme hesabı bulunamadı'; end if;
  insert into public.school_subscription_periods (school_id, plan_code, billing_period, amount, starts_on, ends_on, status, source, created_by, activated_at)
  values (onboarding.school_id, 'pro', 'trial', 0, trial_start, trial_end, 'TRIAL', 'trial', auth.uid(), now());
  update public.schools set subscription_plan = 'pro', subscription_status = 'trial', subscription_trial_mode = 'time_limited', subscription_billing_period = 'monthly', subscription_starts_on = trial_start, subscription_ends_on = trial_end
  where id = onboarding.school_id;
  update public.school_onboardings set status = 'TRIAL_STARTED' where school_id = onboarding.school_id returning * into onboarding;
  return onboarding;
end;
$$;
revoke all on function public.start_school_trial() from public;
grant execute on function public.start_school_trial() to authenticated;

create or replace function public.create_subscription_payment_report(
  requested_plan text,
  requested_billing_period text,
  payer_note text default null
)
returns public.subscription_payment_reports
language plpgsql security definer set search_path = public as $$
declare onboarding public.school_onboardings%rowtype;
declare school_row public.schools%rowtype;
declare period_months integer;
declare period_price numeric;
declare starts_on_value date;
declare ends_on_value date;
declare period_row public.school_subscription_periods%rowtype;
declare report_row public.subscription_payment_reports%rowtype;
begin
  if requested_plan not in ('standard', 'premium', 'pro') or requested_billing_period not in ('monthly', 'quarterly', 'yearly') then raise exception 'Paket veya ödeme dönemi geçersiz'; end if;
  select * into onboarding from public.school_onboardings where applicant_user_id = auth.uid() order by created_at desc limit 1;
  if onboarding.school_id is null then raise exception 'Bu hesap için ödeme başvurusu oluşturulamaz'; end if;
  select * into school_row from public.schools where id = onboarding.school_id for update;
  if exists(select 1 from public.subscription_payment_reports r where r.school_id = school_row.id and r.status = 'PENDING_REVIEW') then raise exception 'Bu okul için incelemede olan bir ödeme bildirimi zaten var'; end if;
  period_months := case requested_billing_period when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
  period_price := case requested_plan when 'standard' then case requested_billing_period when 'monthly' then 799 when 'quarterly' then 2199 else 7990 end when 'premium' then case requested_billing_period when 'monthly' then 1299 when 'quarterly' then 3599 else 12990 end else case requested_billing_period when 'monthly' then 1899 when 'quarterly' then 5199 else 18990 end end;
  starts_on_value := case when school_row.subscription_status in ('active', 'trial') and school_row.subscription_ends_on >= current_date then school_row.subscription_ends_on + 1 else current_date end;
  ends_on_value := (starts_on_value + make_interval(months => period_months) - interval '1 day')::date;
  insert into public.school_subscription_periods (school_id, plan_code, billing_period, amount, starts_on, ends_on, status, source, created_by)
  values (school_row.id, requested_plan, requested_billing_period, period_price, starts_on_value, ends_on_value, 'PENDING_PAYMENT', 'customer_payment', auth.uid()) returning * into period_row;
  insert into public.subscription_payment_reports (school_id, period_id, reported_by, amount, payer_note)
  values (school_row.id, period_row.id, auth.uid(), period_price, nullif(btrim(payer_note), '')) returning * into report_row;
  update public.school_subscription_periods set payment_report_id = report_row.id where id = period_row.id;
  update public.school_onboardings set status = 'PAYMENT_PENDING' where school_id = school_row.id and status = 'PENDING_CHOICE';
  return report_row;
end;
$$;
revoke all on function public.create_subscription_payment_report(text, text, text) from public;
grant execute on function public.create_subscription_payment_report(text, text, text) to authenticated;

create or replace function public.review_subscription_payment_report(target_report_id uuid, approved boolean, reviewer_note text default null)
returns public.subscription_payment_reports
language plpgsql security definer set search_path = public as $$
declare report_row public.subscription_payment_reports%rowtype;
declare period_row public.school_subscription_periods%rowtype;
declare school_row public.schools%rowtype;
begin
  if not public.is_platform_super_admin() then raise exception 'Bu işlem için Süper Admin yetkisi gereklidir'; end if;
  select * into report_row from public.subscription_payment_reports where id = target_report_id for update;
  if report_row.id is null then raise exception 'Ödeme bildirimi bulunamadı'; end if;
  if report_row.status <> 'PENDING_REVIEW' then return report_row; end if;
  select * into period_row from public.school_subscription_periods where id = report_row.period_id for update;
  if approved then
    update public.subscription_payment_reports set status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(reviewer_note), '') where id = report_row.id returning * into report_row;
    if period_row.starts_on <= current_date then
      update public.school_subscription_periods set status = 'ACTIVE', activated_at = now() where id = period_row.id;
      update public.schools set subscription_plan = period_row.plan_code, subscription_status = 'active', subscription_trial_mode = null, subscription_billing_period = period_row.billing_period, subscription_period_price = period_row.amount, subscription_starts_on = period_row.starts_on, subscription_ends_on = period_row.ends_on where id = period_row.school_id;
    else
      update public.school_subscription_periods set status = 'SCHEDULED' where id = period_row.id;
    end if;
    update public.school_onboardings set status = 'COMPLETED' where school_id = period_row.school_id and status <> 'COMPLETED';
  else
    update public.subscription_payment_reports set status = 'REJECTED', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(reviewer_note), '') where id = report_row.id returning * into report_row;
    update public.school_subscription_periods set status = 'REJECTED' where id = period_row.id;
  end if;
  return report_row;
end;
$$;
revoke all on function public.review_subscription_payment_report(uuid, boolean, text) from public;
grant execute on function public.review_subscription_payment_report(uuid, boolean, text) to authenticated;

create or replace function public.apply_due_subscription_periods()
returns integer
language plpgsql security definer set search_path = public as $$
declare updated_count integer := 0;
declare due_period public.school_subscription_periods%rowtype;
begin
  for due_period in select * from public.school_subscription_periods where status = 'SCHEDULED' and starts_on <= current_date order by starts_on, created_at for update skip locked loop
    update public.school_subscription_periods set status = 'ACTIVE', activated_at = coalesce(activated_at, now()) where id = due_period.id;
    update public.schools set subscription_plan = due_period.plan_code, subscription_status = 'active', subscription_trial_mode = null, subscription_billing_period = due_period.billing_period, subscription_period_price = due_period.amount, subscription_starts_on = due_period.starts_on, subscription_ends_on = due_period.ends_on where id = due_period.school_id;
    updated_count := updated_count + 1;
  end loop;
  update public.school_subscription_periods set status = 'EXPIRED' where status in ('ACTIVE', 'TRIAL') and ends_on < current_date;
  update public.schools set subscription_status = 'stopped' where subscription_status in ('active', 'trial') and subscription_ends_on is not null and subscription_ends_on < current_date and not exists (select 1 from public.school_subscription_periods p where p.school_id = schools.id and p.status = 'SCHEDULED');
  return updated_count;
end;
$$;
revoke all on function public.apply_due_subscription_periods() from public;
grant execute on function public.apply_due_subscription_periods() to authenticated;
