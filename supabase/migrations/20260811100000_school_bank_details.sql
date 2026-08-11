alter table public.schools
  add column if not exists bank_name text,
  add column if not exists bank_account_holder text,
  add column if not exists bank_iban text;

alter table public.schools
  drop constraint if exists schools_bank_details_check;

alter table public.schools
  add constraint schools_bank_details_check
  check (
    (bank_name is null and bank_account_holder is null and bank_iban is null)
    or (
      char_length(trim(bank_name)) between 2 and 80
      and char_length(trim(bank_account_holder)) between 2 and 120
      and bank_iban ~ '^TR[0-9]{24}$'
    )
  );

comment on column public.schools.bank_name is 'Velilerin havale ekranında gösterilen doğrulanmış banka adı.';
comment on column public.schools.bank_account_holder is 'Velilerin havale ekranında gösterilen doğrulanmış hesap sahibi.';
comment on column public.schools.bank_iban is 'Boşluksuz, doğrulanmış TR IBAN değeri.';
