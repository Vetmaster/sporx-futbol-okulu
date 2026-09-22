-- Update standard subscription pricing so yearly equals 2.500 TL/month.
-- New customer-facing prices:
-- monthly: 3.000 TL, quarterly: 8.400 TL, yearly: 30.000 TL.

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

  new.subscription_monthly_price := 3000;
  new.subscription_period_price := case new.subscription_billing_period
    when 'monthly' then 3000
    when 'quarterly' then 8400
    when 'yearly' then 30000
    else new.subscription_period_price
  end;
  return new;
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
declare normalized_payer_note text := nullif(btrim($3), '');
begin
  if requested_billing_period not in ('monthly', 'quarterly', 'yearly') then raise exception 'Ödeme dönemi geçersiz'; end if;
  select * into onboarding from public.school_onboardings where applicant_user_id = auth.uid() order by created_at desc limit 1;
  if onboarding.school_id is null then raise exception 'Bu hesap için ödeme başvurusu oluşturulamaz'; end if;
  select * into school_row from public.schools where id = onboarding.school_id for update;
  if exists(select 1 from public.subscription_payment_reports r where r.school_id = school_row.id and r.status = 'PENDING_REVIEW') then raise exception 'Bu okul için incelemede olan bir ödeme bildirimi zaten var'; end if;
  period_months := case requested_billing_period when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
  period_price := case requested_billing_period when 'monthly' then 3000 when 'quarterly' then 8400 else 30000 end;
  starts_on_value := case when school_row.subscription_status in ('active', 'trial') and school_row.subscription_ends_on >= current_date then school_row.subscription_ends_on + 1 else current_date end;
  ends_on_value := (starts_on_value + make_interval(months => period_months) - interval '1 day')::date;

  select *
    into period_row
    from public.school_subscription_periods
   where school_id = school_row.id
     and starts_on = starts_on_value
     and ends_on = ends_on_value
     and billing_period = requested_billing_period
     and status = 'REJECTED'
     and source = 'customer_payment'
   order by updated_at desc
   limit 1
   for update;

  if period_row.id is null then
    insert into public.school_subscription_periods (school_id, plan_code, billing_period, amount, starts_on, ends_on, status, source, created_by)
    values (school_row.id, 'standard', requested_billing_period, period_price, starts_on_value, ends_on_value, 'PENDING_PAYMENT', 'customer_payment', auth.uid()) returning * into period_row;
  else
    update public.school_subscription_periods
       set plan_code = 'standard',
           amount = period_price,
           status = 'PENDING_PAYMENT',
           created_by = auth.uid(),
           activated_at = null
     where id = period_row.id
     returning * into period_row;
  end if;

  select *
    into report_row
    from public.subscription_payment_reports
   where period_id = period_row.id
   order by updated_at desc
   limit 1
   for update;

  if report_row.id is null then
    insert into public.subscription_payment_reports (school_id, period_id, reported_by, amount, payer_note)
    values (school_row.id, period_row.id, auth.uid(), period_price, normalized_payer_note) returning * into report_row;
  else
    update public.subscription_payment_reports
       set status = 'PENDING_REVIEW',
           reported_by = auth.uid(),
           amount = period_price,
           payer_note = normalized_payer_note,
           reviewed_by = null,
           reviewed_at = null,
           review_note = null,
           created_at = now()
     where id = report_row.id
     returning * into report_row;
  end if;

  update public.school_subscription_periods set payment_report_id = report_row.id where id = period_row.id;
  update public.school_onboardings set status = 'PAYMENT_PENDING' where school_id = school_row.id and status = 'PENDING_CHOICE';
  return report_row;
end;
$$;
