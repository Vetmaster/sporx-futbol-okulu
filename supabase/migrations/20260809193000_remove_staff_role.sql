do $$
declare
  converted_profile_count integer;
begin
  update public.profiles
  set role = 'coach'
  where role = 'staff';

  get diagnostics converted_profile_count = row_count;
  raise notice '% normal kullanıcı profili antrenör rolüne dönüştürüldü.', converted_profile_count;
end;
$$;

update public.access_requests
set requested_role = 'coach'
where requested_role = 'staff';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'coach', 'parent'));

alter table public.access_requests
  drop constraint if exists access_requests_requested_role_check;

alter table public.access_requests
  add constraint access_requests_requested_role_check
  check (requested_role in ('admin', 'coach', 'parent'));

create or replace function public.is_school_staff(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_super_admin()
    or (
      public.current_school_id() = target_school_id
      and public.current_user_role() = 'admin'
    )
$$;

revoke all on function public.is_school_staff(uuid) from public;
grant execute on function public.is_school_staff(uuid) to authenticated;
