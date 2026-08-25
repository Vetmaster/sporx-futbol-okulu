-- Add explicit trial modes: a one-month trial or a 10-student trial.
alter table public.schools
  add column if not exists subscription_trial_mode text;

alter table public.schools
  drop constraint if exists schools_subscription_trial_mode_check;

alter table public.schools
  add constraint schools_subscription_trial_mode_check
    check (subscription_trial_mode is null or subscription_trial_mode = 'time_limited');

-- Trials are always free. Active subscriptions continue to use catalogue pricing.
create or replace function public.sync_school_subscription_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.subscription_status = 'trial' then
    new.subscription_monthly_price := 0;
    new.subscription_period_price := 0;
    return new;
  end if;

  new.subscription_monthly_price := case new.subscription_plan
    when 'standard' then 799
    when 'premium' then 1299
    when 'pro' then 1899
    else new.subscription_monthly_price
  end;
  new.subscription_period_price := case new.subscription_plan
    when 'standard' then case new.subscription_billing_period when 'monthly' then 799 when 'quarterly' then 2199 when 'yearly' then 7990 end
    when 'premium' then case new.subscription_billing_period when 'monthly' then 1299 when 'quarterly' then 3599 when 'yearly' then 12990 end
    when 'pro' then case new.subscription_billing_period when 'monthly' then 1899 when 'quarterly' then 5199 when 'yearly' then 18990 end
    else new.subscription_period_price
  end;
  return new;
end;
$$;

drop trigger if exists schools_sync_subscription_price on public.schools;
create trigger schools_sync_subscription_price
before insert or update of subscription_plan, subscription_status, subscription_monthly_price, subscription_billing_period, subscription_period_price on public.schools
for each row execute function public.sync_school_subscription_price();

drop function if exists public.update_school_subscription(uuid, text, text, text, date, date);

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
  if plan_code not in ('standard', 'premium', 'pro') then
    raise exception 'Geçersiz paket seçimi';
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
  set subscription_plan = plan_code,
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

revoke all on function public.update_school_subscription(uuid, text, text, text, text, date, date) from public;
grant execute on function public.update_school_subscription(uuid, text, text, text, text, date, date) to authenticated;

-- Keep already-installed app versions working while they are gradually updated.
-- Older clients do not send a trial mode, so their trial records become the
-- one-month type and receive safe default dates when omitted.
create or replace function public.update_school_subscription(
  target_school_id uuid,
  plan_code text,
  subscription_state text,
  billing_period_code text,
  starts_on date,
  ends_on date
)
returns public.schools
language sql
security definer
set search_path = public
as $$
  select public.update_school_subscription(
    target_school_id,
    plan_code,
    subscription_state,
    case when subscription_state = 'trial' then 'time_limited' else null end,
    billing_period_code,
    case when subscription_state = 'trial' then coalesce(starts_on, current_date) else starts_on end,
    case when subscription_state = 'trial' then coalesce(ends_on, (current_date + interval '1 month')::date) else ends_on end
  )
$$;

revoke all on function public.update_school_subscription(uuid, text, text, text, date, date) from public;
grant execute on function public.update_school_subscription(uuid, text, text, text, date, date) to authenticated;

create or replace function public.school_plan_student_limit(target_school_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when subscription_plan = 'standard' then 100
    when subscription_plan = 'premium' then 500
    when subscription_plan = 'pro' then null
  end
  from public.schools
  where id = target_school_id
    and (id = public.current_school_id() or public.is_platform_super_admin())
$$;

create or replace function public.enforce_school_student_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_limit integer;
  current_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text, 0));

  select case
      when subscription_plan = 'standard' then 100
      when subscription_plan = 'premium' then 500
      when subscription_plan = 'pro' then null
    end
  into student_limit
  from public.schools
  where id = new.school_id;

  if student_limit is not null then
    select count(*) into current_count from public.students where school_id = new.school_id;
    if current_count >= student_limit then
      raise exception 'Bu okul en fazla % öğrenci kaydına izin veren paket sınırına ulaştı', student_limit;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.school_subscription_allows_access(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_super_admin()
    or exists (
      select 1
      from public.schools
      where id = target_school_id
        and subscription_status <> 'stopped'
        and (
          subscription_status <> 'trial'
          or subscription_trial_mode <> 'time_limited'
          or subscription_ends_on is null
          or subscription_ends_on >= current_date
        )
    )
$$;
