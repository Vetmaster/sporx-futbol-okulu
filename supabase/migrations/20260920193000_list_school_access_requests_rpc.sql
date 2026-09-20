create or replace function public.list_school_access_requests(target_school_id uuid)
returns table (
  id bigint,
  user_id uuid,
  school_id uuid,
  email text,
  full_name text,
  requested_role text,
  status text,
  email_verified_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select request.id,
         request.user_id,
         request.school_id,
         request.email,
         request.full_name,
         request.requested_role,
         request.status,
         request.email_verified_at,
         request.reviewed_at,
         request.created_at
  from public.access_requests request
  where request.school_id = target_school_id
    and (
      public.is_school_super_admin(target_school_id)
      or (
        public.is_school_admin(target_school_id)
        and request.requested_role = 'parent'
      )
    )
  order by request.created_at desc;
$$;

revoke all on function public.list_school_access_requests(uuid) from public;
grant execute on function public.list_school_access_requests(uuid) to authenticated;
