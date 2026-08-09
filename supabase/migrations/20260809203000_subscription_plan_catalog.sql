-- Fixed SaaS package catalogue and student-cap enforcement.
alter table public.schools
  drop constraint if exists schools_subscription_plan_check;

update public.schools
set subscription_plan = case subscription_plan
      when 'starter' then 'standard'
      when 'professional' then 'premium'
      when 'enterprise' then 'pro'
      when 'custom' then 'pro'
      else subscription_plan
    end;

alter table public.schools
  alter column subscription_plan set default 'standard',
  alter column subscription_monthly_price set default 799,
  add constraint schools_subscription_plan_check
    check (subscription_plan in ('standard', 'premium', 'pro'));

update public.schools
set subscription_monthly_price = case subscription_plan
  when 'standard' then 799
  when 'premium' then 1299
  when 'pro' then 1899
end;

create or replace function public.sync_school_subscription_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.subscription_monthly_price := case new.subscription_plan
    when 'standard' then 799
    when 'premium' then 1299
    when 'pro' then 1899
    else new.subscription_monthly_price
  end;
  return new;
end;
$$;

drop trigger if exists schools_sync_subscription_price on public.schools;
create trigger schools_sync_subscription_price
before insert or update of subscription_plan, subscription_monthly_price on public.schools
for each row execute function public.sync_school_subscription_price();

drop function if exists public.update_school_subscription(uuid, text, text, numeric, date, date);

create or replace function public.update_school_subscription(
  target_school_id uuid,
  plan_code text,
  subscription_state text,
  starts_on date default null,
  ends_on date default null
)
returns public.schools
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_school public.schools%rowtype;
begin
  if not public.is_platform_super_admin() then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
  end if;
  if plan_code not in ('standard', 'premium', 'pro') then
    raise exception 'Geçersiz paket seçimi';
  end if;
  if subscription_state not in ('trial', 'active', 'past_due', 'suspended', 'cancelled') then
    raise exception 'Geçersiz abonelik durumu';
  end if;
  if starts_on is not null and ends_on is not null and ends_on < starts_on then
    raise exception 'Bitiş tarihi başlangıç tarihinden önce olamaz';
  end if;

  update public.schools
  set subscription_plan = plan_code,
      subscription_status = subscription_state,
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

revoke all on function public.update_school_subscription(uuid, text, text, date, date) from public;
grant execute on function public.update_school_subscription(uuid, text, text, date, date) to authenticated;

create or replace function public.school_plan_student_limit(target_school_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case subscription_plan
    when 'standard' then 100
    when 'premium' then 500
    when 'pro' then null
  end
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
  select coalesce((
    select case feature_code
      when 'online_payments' then subscription_plan in ('premium', 'pro')
      when 'student_performance' then subscription_plan in ('premium', 'pro')
      when 'online_market' then subscription_plan = 'pro'
      when 'scout_video_sharing' then subscription_plan = 'pro'
      else false
    end
    from public.schools
    where id = target_school_id
      and (id = public.current_school_id() or public.is_platform_super_admin())
  ), false)
$$;

revoke all on function public.school_plan_student_limit(uuid) from public;
revoke all on function public.school_plan_has_feature(uuid, text) from public;
grant execute on function public.school_plan_student_limit(uuid) to authenticated;
grant execute on function public.school_plan_has_feature(uuid, text) to authenticated;

create or replace function public.enforce_school_student_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_code text;
  student_limit integer;
  current_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text, 0));

  select subscription_plan into plan_code
  from public.schools
  where id = new.school_id;

  student_limit := case plan_code
    when 'standard' then 100
    when 'premium' then 500
    when 'pro' then null
  end;

  if student_limit is not null then
    select count(*) into current_count
    from public.students
    where school_id = new.school_id;

    if current_count >= student_limit then
      raise exception '% paketi en fazla % öğrenci kaydına izin verir',
        case plan_code when 'standard' then 'Standart' when 'premium' then 'Premium' else plan_code end,
        student_limit;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists students_enforce_school_plan_limit on public.students;
create trigger students_enforce_school_plan_limit
before insert on public.students
for each row execute function public.enforce_school_student_limit();
