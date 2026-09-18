-- Keep the existing atomic fee-payment function for older clients, and allow
-- the new form to override each selected month's amount in the same transaction.
create or replace function public.record_accounting_fee_payments_with_amounts(
  target_school_id uuid,
  target_student_id bigint,
  target_months text[],
  target_amounts numeric[],
  payment_date date,
  payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded jsonb;
  result jsonb := '[]'::jsonb;
  item jsonb;
  item_amount numeric(12,2);
  item_index integer := 1;
  updated_count integer;
begin
  if target_months is null or target_amounts is null
     or cardinality(target_months) not between 1 and 6
     or cardinality(target_months) <> cardinality(target_amounts) then
    raise exception 'Aidat ayları ve tutarları eşleşmiyor.';
  end if;
  for item_index in 1..cardinality(target_amounts) loop
    if target_amounts[item_index] is null or target_amounts[item_index] <= 0
       or target_amounts[item_index] > 99999999.99 then
      raise exception 'Aidat tutarı geçersiz.';
    end if;
  end loop;

  recorded := public.record_accounting_fee_payments(
    target_school_id, target_student_id, target_months, payment_date, payment_method
  );
  item_index := 1;
  for item in select value from jsonb_array_elements(recorded) as selected(value) loop
    item_amount := round(target_amounts[item_index], 2);
    update public.fee_periods
    set amount = item_amount
    where school_id = target_school_id
      and student_id = target_student_id
      and fee_month = ((item->>'month') || '-01')::date
      and status = 'paid';
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'Aidat dönemi güncellenemedi.'; end if;

    update public.accounting_entries
    set amount = item_amount
    where id = (item->>'accountingId')::bigint
      and school_id = target_school_id
      and student_id = target_student_id
      and source = 'fee';
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'Muhasebe tutarı güncellenemedi.'; end if;

    result := result || jsonb_set(item, '{amount}', to_jsonb(item_amount));
    item_index := item_index + 1;
  end loop;
  return result;
end;
$$;

revoke all on function public.record_accounting_fee_payments_with_amounts(uuid, bigint, text[], numeric[], date, text) from public, anon;
grant execute on function public.record_accounting_fee_payments_with_amounts(uuid, bigint, text[], numeric[], date, text) to authenticated;
