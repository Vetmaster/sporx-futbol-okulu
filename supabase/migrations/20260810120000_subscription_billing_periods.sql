-- Store the selected subscription billing period and its fixed catalogue price.
alter table public.schools
  add column if not exists subscription_billing_period text not null default 'monthly',
  add column if not exists subscription_period_price numeric(12, 2) not null default 799;

alter table public.schools
  drop constraint if exists schools_subscription_billing_period_check,
  drop constraint if exists schools_subscription_period_price_check;

alter table public.schools
  add constraint schools_subscription_billing_period_check
    check (subscription_billing_period in ('monthly', 'quarterly', 'yearly')),
  add constraint schools_subscription_period_price_check
    check (subscription_period_price >= 0);

update public.schools
set subscription_billing_period = 'monthly',
    subscription_period_price = case subscription_plan
      when 'standard' then 799
      when 'premium' then 1299
      when 'pro' then 1899
      else 799
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
before insert or update of subscription_plan, subscription_monthly_price, subscription_billing_period, subscription_period_price on public.schools
for each row execute function public.sync_school_subscription_price();

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
  if subscription_state not in ('trial', 'active', 'past_due', 'suspended', 'cancelled') then
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
