-- School package and subscription management for platform Super Admins.
alter table public.schools
  add column if not exists subscription_plan text not null default 'starter',
  add column if not exists subscription_status text not null default 'trial',
  add column if not exists subscription_monthly_price numeric(12, 2) not null default 0,
  add column if not exists subscription_starts_on date,
  add column if not exists subscription_ends_on date;

alter table public.schools
  drop constraint if exists schools_subscription_plan_check,
  drop constraint if exists schools_subscription_status_check,
  drop constraint if exists schools_subscription_monthly_price_check,
  drop constraint if exists schools_subscription_dates_check;

alter table public.schools
  add constraint schools_subscription_plan_check
    check (subscription_plan in ('starter', 'professional', 'enterprise', 'custom')),
  add constraint schools_subscription_status_check
    check (subscription_status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  add constraint schools_subscription_monthly_price_check
    check (subscription_monthly_price >= 0),
  add constraint schools_subscription_dates_check
    check (subscription_ends_on is null or subscription_starts_on is null or subscription_ends_on >= subscription_starts_on);

create or replace function public.update_school_subscription(
  target_school_id uuid,
  plan_code text,
  subscription_state text,
  monthly_price numeric,
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
  if plan_code not in ('starter', 'professional', 'enterprise', 'custom') then
    raise exception 'Geçersiz paket seçimi';
  end if;
  if subscription_state not in ('trial', 'active', 'past_due', 'suspended', 'cancelled') then
    raise exception 'Geçersiz abonelik durumu';
  end if;
  if monthly_price < 0 then
    raise exception 'Aylık ücret negatif olamaz';
  end if;
  if starts_on is not null and ends_on is not null and ends_on < starts_on then
    raise exception 'Bitiş tarihi başlangıç tarihinden önce olamaz';
  end if;

  update public.schools
  set subscription_plan = plan_code,
      subscription_status = subscription_state,
      subscription_monthly_price = monthly_price,
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

revoke all on function public.update_school_subscription(uuid, text, text, numeric, date, date) from public;
grant execute on function public.update_school_subscription(uuid, text, text, numeric, date, date) to authenticated;
