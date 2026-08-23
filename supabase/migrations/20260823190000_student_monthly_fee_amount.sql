alter table public.students
  add column if not exists monthly_fee_amount numeric(12,2);

alter table public.students
  add constraint students_monthly_fee_amount_positive
  check (monthly_fee_amount is null or monthly_fee_amount > 0) not valid;
