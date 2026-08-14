-- Simplify school subscription states to trial, active and stopped.
alter table public.schools
  drop constraint if exists schools_subscription_status_check;

update public.schools
set subscription_status = 'stopped'
where subscription_status not in ('trial', 'active');

alter table public.schools
  add constraint schools_subscription_status_check
    check (subscription_status in ('trial', 'active', 'stopped'));

create or replace function public.update_school_subscription(
  target_school_id uuid,
  plan_code text,
  subscription_state text,
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
  if starts_on is not null and ends_on is not null and ends_on < starts_on then
    raise exception 'Bitiş tarihi başlangıç tarihinden önce olamaz';
  end if;

  update public.schools
  set subscription_plan = plan_code,
      subscription_status = subscription_state,
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

revoke all on function public.update_school_subscription(uuid, text, text, text, date, date) from public;
grant execute on function public.update_school_subscription(uuid, text, text, text, date, date) to authenticated;

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
    )
$$;

revoke all on function public.school_subscription_allows_access(uuid) from public;
grant execute on function public.school_subscription_allows_access(uuid) to authenticated;
