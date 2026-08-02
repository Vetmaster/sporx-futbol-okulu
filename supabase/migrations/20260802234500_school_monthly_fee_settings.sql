alter table public.schools
  add column if not exists monthly_fee_amount numeric(12, 2) not null default 1500;

alter table public.schools
  drop constraint if exists schools_monthly_fee_amount_check;

alter table public.schools
  add constraint schools_monthly_fee_amount_check
  check (monthly_fee_amount > 0);

drop policy if exists "admins can update school settings" on public.schools;
create policy "admins can update school settings"
on public.schools for update to authenticated
using (public.is_school_admin(id))
with check (public.is_school_admin(id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'schools'
  ) then
    alter publication supabase_realtime add table public.schools;
  end if;
end;
$$;
