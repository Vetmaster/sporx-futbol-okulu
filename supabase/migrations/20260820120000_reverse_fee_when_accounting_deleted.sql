create or replace function public.reverse_paid_fee_after_accounting_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_student_id bigint;
  linked_fee_month date;
begin
  if old.source is distinct from 'fee' then
    return old;
  end if;

  if old.fee_period_id is not null then
    update public.fee_periods
    set status = 'late',
        paid_at = null,
        payment_method = null,
        note = null,
        updated_at = now()
    where id = old.fee_period_id
      and school_id = old.school_id
      and status = 'paid';
  elsif old.reference ~ '^fee:[0-9]+:[0-9]{4}-[0-9]{2}$' then
    linked_student_id := split_part(old.reference, ':', 2)::bigint;
    linked_fee_month := (split_part(old.reference, ':', 3) || '-01')::date;

    update public.fee_periods
    set status = 'late',
        paid_at = null,
        payment_method = null,
        note = null,
        updated_at = now()
    where school_id = old.school_id
      and student_id = linked_student_id
      and fee_month = linked_fee_month
      and status = 'paid';
  end if;

  return old;
end;
$$;

revoke all on function public.reverse_paid_fee_after_accounting_delete() from public;

drop trigger if exists accounting_entries_reverse_paid_fee on public.accounting_entries;
create trigger accounting_entries_reverse_paid_fee
before delete on public.accounting_entries
for each row
execute function public.reverse_paid_fee_after_accounting_delete();

comment on function public.reverse_paid_fee_after_accounting_delete() is
  'Aidata bağlı muhasebe tahsilatı silinirse, halen ödenmiş olan aidatı ödenmedi durumuna döndürür.';
