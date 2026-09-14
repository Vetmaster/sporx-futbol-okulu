create or replace function public.review_subscription_payment_report(target_report_id uuid, approved boolean, reviewer_note text default null)
returns public.subscription_payment_reports
language plpgsql security definer set search_path = public as $$
declare report_row public.subscription_payment_reports%rowtype;
declare period_row public.school_subscription_periods%rowtype;
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
    update public.school_onboardings set status = 'PENDING_CHOICE' where school_id = period_row.school_id and status = 'PAYMENT_PENDING';
  end if;
  return report_row;
end;
$$;

revoke all on function public.review_subscription_payment_report(uuid, boolean, text) from public;
grant execute on function public.review_subscription_payment_report(uuid, boolean, text) to authenticated;
