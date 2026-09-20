drop policy if exists "school admins can view parent access requests" on public.access_requests;

create policy "school admins can view parent access requests"
on public.access_requests for select to authenticated
using (
  requested_role = 'parent'
  and public.is_school_admin(school_id)
);

create or replace function public.pending_access_request_for_current_user()
returns table (
  status text,
  requested_role text,
  school_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select request.status,
         request.requested_role,
         school.name as school_name
  from public.access_requests request
  join public.schools school on school.id = request.school_id
  where request.user_id = auth.uid()
  order by request.created_at desc
  limit 1;
$$;

revoke all on function public.pending_access_request_for_current_user() from public;
grant execute on function public.pending_access_request_for_current_user() to authenticated;
