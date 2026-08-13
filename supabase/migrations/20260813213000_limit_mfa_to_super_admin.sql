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
      public.current_school_id() = target_school_id
      and public.current_user_role() = 'admin'
      and public.school_subscription_allows_access(target_school_id)
    )
$$;

comment on function public.current_session_is_aal2() is
  'Süper Admin işlemlerinde doğrulanmış ikinci faktör şartını denetler.';
