drop function if exists public.list_school_access_requests(uuid);

create function public.list_school_access_requests(target_school_id uuid)
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
  created_at timestamptz,
  context_school_name text,
  context_student_name text
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
         request.created_at,
         school.name as context_school_name,
         student.full_name as context_student_name
  from public.access_requests request
  join public.schools school on school.id = request.school_id
  left join lateral (
    select s.full_name
    from public.students s
    where s.school_id = request.school_id
      and request.requested_role = 'parent'
      and (
        s.guardian_user_id = request.user_id
        or lower(btrim(s.email)) = lower(btrim(request.email))
      )
    order by
      case when s.guardian_user_id = request.user_id then 0 else 1 end,
      s.id desc
    limit 1
  ) student on true
  where request.school_id = target_school_id
    and (
      exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.role = 'super_admin'
      )
      or (
        exists (
          select 1
          from public.school_user_memberships membership
          where membership.user_id = auth.uid()
            and membership.school_id = target_school_id
            and membership.role = 'admin'
        )
        and request.requested_role = 'parent'
      )
    )
  order by request.created_at desc;
$$;

revoke all on function public.list_school_access_requests(uuid) from public;
grant execute on function public.list_school_access_requests(uuid) to authenticated;
