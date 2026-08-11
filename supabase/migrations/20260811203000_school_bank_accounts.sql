alter table public.schools
  add column if not exists bank_accounts jsonb not null default '[]'::jsonb;

create or replace function public.valid_school_bank_accounts(accounts jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    jsonb_typeof(accounts) = 'array'
    and jsonb_array_length(accounts) <= 4
    and not exists (
      select 1
      from jsonb_array_elements(accounts) as account
      where jsonb_typeof(account) <> 'object'
        or char_length(trim(coalesce(account ->> 'bankName', ''))) not between 2 and 80
        or char_length(trim(coalesce(account ->> 'accountHolder', ''))) not between 2 and 120
        or coalesce(account ->> 'iban', '') !~ '^TR[0-9]{24}$'
    )
    and (
      select count(*) = count(distinct account ->> 'iban')
      from jsonb_array_elements(accounts) as account
    );
$$;

update public.schools
set bank_accounts = jsonb_build_array(jsonb_build_object(
  'bankName', trim(bank_name),
  'accountHolder', trim(bank_account_holder),
  'iban', bank_iban
))
where bank_accounts = '[]'::jsonb
  and bank_name is not null
  and bank_account_holder is not null
  and bank_iban is not null;

alter table public.schools
  drop constraint if exists schools_bank_accounts_check;

alter table public.schools
  add constraint schools_bank_accounts_check
  check (public.valid_school_bank_accounts(bank_accounts));

comment on column public.schools.bank_accounts is 'Velilerin havale ekranında gösterilen, en fazla dört doğrulanmış banka hesabı.';
