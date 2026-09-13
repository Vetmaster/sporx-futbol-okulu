-- Platform transfer accounts are separate from each school's parent-fee accounts.
create table if not exists public.subscription_bank_account_settings (
  singleton boolean primary key default true check (singleton),
  bank_accounts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.subscription_bank_account_settings enable row level security;
revoke all on public.subscription_bank_account_settings from public, anon, authenticated;

create or replace function public.get_subscription_bank_accounts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_super_admin() and not exists (
    select 1 from public.school_onboardings
    where applicant_user_id = auth.uid()
  ) then
    raise exception 'Abonelik havale bilgilerini görüntüleme yetkiniz yok';
  end if;

  return coalesce((select bank_accounts from public.subscription_bank_account_settings where singleton), '[]'::jsonb);
end;
$$;

create or replace function public.save_subscription_bank_accounts(accounts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
  end if;
  if jsonb_typeof(accounts) <> 'array' or jsonb_array_length(accounts) not between 1 and 4 then
    raise exception '1 ile 4 arasında havale hesabı girin';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(accounts) as account
    where coalesce(btrim(account->>'bankName'), '') = ''
      or coalesce(btrim(account->>'accountHolder'), '') = ''
      or coalesce(btrim(account->>'iban'), '') = ''
  ) then
    raise exception 'Her hesapta banka adı, hesap sahibi ve IBAN zorunludur';
  end if;

  insert into public.subscription_bank_account_settings (singleton, bank_accounts, updated_at, updated_by)
  values (true, accounts, now(), auth.uid())
  on conflict (singleton) do update
  set bank_accounts = excluded.bank_accounts,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return accounts;
end;
$$;

revoke all on function public.get_subscription_bank_accounts() from public;
grant execute on function public.get_subscription_bank_accounts() to authenticated;
revoke all on function public.save_subscription_bank_accounts(jsonb) from public;
grant execute on function public.save_subscription_bank_accounts(jsonb) to authenticated;
