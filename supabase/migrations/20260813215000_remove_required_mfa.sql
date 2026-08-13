create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  )
$$;

comment on function public.current_session_is_aal2() is
  'İsteğe bağlı ikinci faktör oturum seviyesini denetler; rol erişiminde zorunlu değildir.';
