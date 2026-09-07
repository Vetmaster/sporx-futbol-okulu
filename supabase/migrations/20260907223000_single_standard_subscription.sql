-- SASA-F has one standard subscription. Keep the legacy column for backward
-- compatibility, but normalize all records and remove package-driven limits.
-- The old uniqueness rule contained plan_code, so it has to be removed before
-- legacy periods with otherwise identical dates are normalized.
alter table public.school_subscription_periods
  drop constraint if exists school_subscription_periods_school_id_starts_on_ends_on_plan_code_key;

update public.school_subscription_periods
set plan_code = 'standard'
where plan_code <> 'standard';

update public.schools
set subscription_plan = 'standard'
where subscription_plan <> 'standard';

alter table public.schools
  drop constraint if exists schools_subscription_plan_check;

alter table public.schools
  alter column subscription_plan set default 'standard',
  add constraint schools_subscription_plan_check
    check (subscription_plan = 'standard');

alter table public.school_subscription_periods
  drop constraint if exists school_subscription_periods_plan_code_check;

alter table public.school_subscription_periods
  add constraint school_subscription_periods_plan_code_check
    check (plan_code = 'standard');

create or replace function public.sync_school_subscription_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.subscription_plan := 'standard';
  if new.subscription_status = 'trial' then
    new.subscription_monthly_price := 0;
    new.subscription_period_price := 0;
    return new;
  end if;

  new.subscription_monthly_price := 799;
  new.subscription_period_price := case new.subscription_billing_period
    when 'monthly' then 799
    when 'quarterly' then 2199
    when 'yearly' then 7990
    else new.subscription_period_price
  end;
  return new;
end;
$$;

create or replace function public.update_school_subscription(
  target_school_id uuid,
  plan_code text,
  subscription_state text,
  trial_mode_code text,
  billing_period_code text,
  starts_on date,
  ends_on date
)
returns public.schools
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_school public.schools%rowtype;
  normalized_trial_mode text;
begin
  if not public.is_platform_super_admin() then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
  end if;
  if subscription_state not in ('trial', 'active', 'stopped') then
    raise exception 'Geçersiz abonelik durumu';
  end if;
  if billing_period_code not in ('monthly', 'quarterly', 'yearly') then
    raise exception 'Geçersiz ödeme dönemi';
  end if;

  normalized_trial_mode := case when subscription_state = 'trial' then trial_mode_code else null end;
  if subscription_state = 'trial' and normalized_trial_mode <> 'time_limited' then
    raise exception 'Geçersiz deneme türü';
  end if;
  if starts_on is not null and ends_on is not null and ends_on < starts_on then
    raise exception 'Bitiş tarihi başlangıç tarihinden önce olamaz';
  end if;
  if normalized_trial_mode = 'time_limited' and (starts_on is null or ends_on is null) then
    raise exception 'Süreli denemede başlangıç ve bitiş tarihi zorunludur';
  end if;

  update public.schools
  set subscription_plan = 'standard',
      subscription_status = subscription_state,
      subscription_trial_mode = normalized_trial_mode,
      subscription_billing_period = billing_period_code,
      subscription_starts_on = starts_on,
      subscription_ends_on = ends_on
  where id = target_school_id
  returning * into updated_school;

  if updated_school.id is null then
    raise exception 'Okul bulunamadı';
  end if;
  return updated_school;
end;
$$;

create or replace function public.school_plan_student_limit(target_school_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select null::integer
  from public.schools
  where id = target_school_id
    and (id = public.current_school_id() or public.is_platform_super_admin())
$$;

create or replace function public.school_plan_has_feature(target_school_id uuid, feature_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.schools
    where id = target_school_id
      and (id = public.current_school_id() or public.is_platform_super_admin())
  )
$$;

create or replace function public.enforce_school_student_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

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
  values (onboarding.school_id, 'standard', 'trial', 0, trial_start, trial_end, 'TRIAL', 'trial', auth.uid(), now());
  update public.schools set subscription_plan = 'standard', subscription_status = 'trial', subscription_trial_mode = 'time_limited', subscription_billing_period = 'monthly', subscription_starts_on = trial_start, subscription_ends_on = trial_end
  where id = onboarding.school_id;
  update public.school_onboardings set status = 'TRIAL_STARTED' where school_id = onboarding.school_id returning * into onboarding;
  return onboarding;
end;
$$;

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
  if requested_billing_period not in ('monthly', 'quarterly', 'yearly') then raise exception 'Ödeme dönemi geçersiz'; end if;
  select * into onboarding from public.school_onboardings where applicant_user_id = auth.uid() order by created_at desc limit 1;
  if onboarding.school_id is null then raise exception 'Bu hesap için ödeme başvurusu oluşturulamaz'; end if;
  select * into school_row from public.schools where id = onboarding.school_id for update;
  if exists(select 1 from public.subscription_payment_reports r where r.school_id = school_row.id and r.status = 'PENDING_REVIEW') then raise exception 'Bu okul için incelemede olan bir ödeme bildirimi zaten var'; end if;
  period_months := case requested_billing_period when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
  period_price := case requested_billing_period when 'monthly' then 799 when 'quarterly' then 2199 else 7990 end;
  starts_on_value := case when school_row.subscription_status in ('active', 'trial') and school_row.subscription_ends_on >= current_date then school_row.subscription_ends_on + 1 else current_date end;
  ends_on_value := (starts_on_value + make_interval(months => period_months) - interval '1 day')::date;
  insert into public.school_subscription_periods (school_id, plan_code, billing_period, amount, starts_on, ends_on, status, source, created_by)
  values (school_row.id, 'standard', requested_billing_period, period_price, starts_on_value, ends_on_value, 'PENDING_PAYMENT', 'customer_payment', auth.uid()) returning * into period_row;
  insert into public.subscription_payment_reports (school_id, period_id, reported_by, amount, payer_note)
  values (school_row.id, period_row.id, auth.uid(), period_price, nullif(btrim(payer_note), '')) returning * into report_row;
  update public.school_subscription_periods set payment_report_id = report_row.id where id = period_row.id;
  update public.school_onboardings set status = 'PAYMENT_PENDING' where school_id = school_row.id and status = 'PENDING_CHOICE';
  return report_row;
end;
$$;
