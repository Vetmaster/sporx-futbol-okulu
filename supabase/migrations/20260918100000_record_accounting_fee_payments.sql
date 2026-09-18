-- Record all selected fee months and their ledger entries atomically.
create or replace function public.record_accounting_fee_payments(
  target_school_id uuid,
  target_student_id bigint,
  target_months text[],
  payment_date date,
  payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_row public.students%rowtype;
  school_fee numeric(12,2);
  month_text text;
  month_start date;
  first_month date := date_trunc('month', now() at time zone 'Europe/Istanbul')::date;
  fee_row public.fee_periods%rowtype;
  fee_amount numeric(12,2);
  fee_id bigint;
  ledger_id bigint;
  month_label text;
  saved jsonb := '[]'::jsonb;
begin
  if not public.is_school_admin(target_school_id) then
    raise exception 'Bu okul için aidat tahsilatı yetkiniz bulunmuyor.';
  end if;
  if target_months is null or cardinality(target_months) not between 1 and 6
     or cardinality(target_months) <> (select count(distinct value) from unnest(target_months) as selected_month(value)) then
    raise exception 'Bir ile altı farklı aidat ayı seçin.';
  end if;
  if payment_date is null or payment_method not in ('cash', 'transfer', 'card') then
    raise exception 'Ödeme tarihi veya yöntemi geçersiz.';
  end if;

  select * into student_row from public.students
  where id = target_student_id and school_id = target_school_id for update;
  if not found then raise exception 'Öğrenci bulunamadı.'; end if;
  select monthly_fee_amount into school_fee from public.schools where id = target_school_id;

  foreach month_text in array target_months loop
    if month_text !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
      raise exception 'Aidat ayı geçersiz: %', month_text;
    end if;
    month_start := to_date(month_text || '-01', 'YYYY-MM-DD');
    if month_start < first_month or month_start >= (first_month + interval '6 months')::date then
      raise exception 'Yalnızca bu ay ve sonraki beş ay için ödeme alınabilir.';
    end if;
    select * into fee_row from public.fee_periods
    where student_id = target_student_id and fee_month = month_start;
    if found and fee_row.status in ('paid', 'exempt') then
      raise exception '% dönemi zaten ödenmiş veya muaftır.', month_text;
    end if;
    fee_amount := coalesce(nullif(fee_row.amount, 0), nullif(student_row.monthly_fee_amount, 0), school_fee);
    if fee_amount is null or fee_amount <= 0 then
      raise exception 'Geçerli aidat tutarı bulunamadı.';
    end if;

    insert into public.fee_periods (
      school_id, student_id, fee_month, status, amount, due_date,
      paid_at, payment_method, note, source
    ) values (
      target_school_id, target_student_id, month_start, 'paid', fee_amount,
      (month_start + interval '1 month - 1 day')::date,
      (payment_date::text || 'T12:00:00Z')::timestamptz,
      payment_method, null, 'app'
    )
    on conflict (student_id, fee_month) do update set
      status = 'paid', amount = excluded.amount, due_date = excluded.due_date,
      paid_at = excluded.paid_at, payment_method = excluded.payment_method,
      note = null, source = 'app'
    returning id into fee_id;

    month_label := (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                           'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])[extract(month from month_start)::int]
                   || ' ' || extract(year from month_start)::int;
    insert into public.accounting_entries (
      school_id, student_id, fee_period_id, occurred_on, title, kind,
      amount, payment_method, source, reference, created_by
    ) values (
      target_school_id, target_student_id, fee_id, payment_date,
      student_row.full_name || ' · ' || month_label || ' aidatı', 'income',
      fee_amount, payment_method, 'fee',
      'fee:' || target_student_id || ':' || month_text, auth.uid()
    )
    on conflict (school_id, reference) where reference is not null do update set
      fee_period_id = excluded.fee_period_id,
      occurred_on = excluded.occurred_on,
      title = excluded.title,
      amount = excluded.amount,
      payment_method = excluded.payment_method,
      source = excluded.source
    returning id into ledger_id;

    saved := saved || jsonb_build_object('month', month_text, 'amount', fee_amount, 'accountingId', ledger_id);
  end loop;
  return saved;
end;
$$;

revoke all on function public.record_accounting_fee_payments(uuid, bigint, text[], date, text) from public, anon;
grant execute on function public.record_accounting_fee_payments(uuid, bigint, text[], date, text) to authenticated;
