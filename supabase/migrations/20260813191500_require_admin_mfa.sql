create or replace function public.current_session_is_aal2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

revoke all on function public.current_session_is_aal2() from public;
grant execute on function public.current_session_is_aal2() to authenticated;

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_session_is_aal2()
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'super_admin'
    )
$$;

create or replace function public.is_school_staff(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_super_admin()
    or (
      public.current_session_is_aal2()
      and public.current_school_id() = target_school_id
      and public.current_user_role() = 'admin'
      and public.school_subscription_allows_access(target_school_id)
    )
$$;

create or replace function public.is_school_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_super_admin()
    or (
      public.current_session_is_aal2()
      and public.current_school_id() = target_school_id
      and public.current_user_role() = 'admin'
      and public.school_subscription_allows_access(target_school_id)
    )
$$;

create or replace function public.is_school_super_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_super_admin()
$$;

comment on function public.current_session_is_aal2() is
  'Admin ve Süper Admin işlemlerinde doğrulanmış ikinci faktör şartını denetler.';
