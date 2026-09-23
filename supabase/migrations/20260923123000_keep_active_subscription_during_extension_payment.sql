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
  period_price := case requested_billing_period when 'monthly' then 2990 when 'quarterly' then 8370 else 29900 end;
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
  update public.school_onboardings set status = 'PAYMENT_PENDING' where school_id = school_row.id and status <> 'PAYMENT_PENDING';
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
  select * into school_row from public.schools where id = period_row.school_id for update;

  if approved then
    update public.subscription_payment_reports set status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(reviewer_note), '') where id = report_row.id returning * into report_row;
    if period_row.starts_on <= current_date then
      update public.school_subscription_periods set status = 'ACTIVE', activated_at = now() where id = period_row.id;
      update public.schools set subscription_plan = period_row.plan_code, subscription_status = 'active', subscription_trial_mode = null, subscription_billing_period = period_row.billing_period, subscription_period_price = period_row.amount, subscription_starts_on = period_row.starts_on, subscription_ends_on = period_row.ends_on where id = period_row.school_id;
    else
      update public.school_subscription_periods set status = 'SCHEDULED' where id = period_row.id;
      if school_row.subscription_status = 'active' and coalesce(school_row.subscription_ends_on, current_date - 1) >= current_date then
        update public.schools
           set subscription_plan = period_row.plan_code,
               subscription_status = 'active',
               subscription_trial_mode = null,
               subscription_billing_period = period_row.billing_period,
               subscription_period_price = period_row.amount,
               subscription_ends_on = greatest(coalesce(school_row.subscription_ends_on, period_row.ends_on), period_row.ends_on)
         where id = period_row.school_id;
      end if;
    end if;
    update public.school_onboardings set status = 'COMPLETED' where school_id = period_row.school_id and status <> 'COMPLETED';
  else
    update public.subscription_payment_reports set status = 'REJECTED', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(reviewer_note), '') where id = report_row.id returning * into report_row;
    update public.school_subscription_periods set status = 'REJECTED' where id = period_row.id;
    if school_row.subscription_status in ('active', 'trial') and coalesce(school_row.subscription_ends_on, current_date - 1) >= current_date then
      update public.school_onboardings set status = 'COMPLETED' where school_id = period_row.school_id and status = 'PAYMENT_PENDING';
    else
      update public.school_onboardings set status = 'PENDING_CHOICE' where school_id = period_row.school_id and status = 'PAYMENT_PENDING';
    end if;
  end if;
  return report_row;
end;
$$;

revoke all on function public.review_subscription_payment_report(uuid, boolean, text) from public;
grant execute on function public.review_subscription_payment_report(uuid, boolean, text) to authenticated;
