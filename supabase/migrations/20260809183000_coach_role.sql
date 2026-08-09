alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'staff', 'coach', 'parent'));

alter table public.access_requests
  drop constraint if exists access_requests_requested_role_check;

alter table public.access_requests
  add constraint access_requests_requested_role_check
  check (requested_role in ('admin', 'staff', 'coach', 'parent'));

create or replace function public.is_school_coach(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_school_id() = target_school_id
    and public.current_user_role() = 'coach'
$$;

revoke all on function public.is_school_coach(uuid) from public;
grant execute on function public.is_school_coach(uuid) to authenticated;

create or replace function public.coach_student_directory(target_school_id uuid)
returns table (
  id bigint,
  full_name text,
  birth_date date,
  birth_year smallint,
  player_position text,
  enrollment_date date,
  attendance_rate numeric,
  group_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_school_coach(target_school_id) then
    raise exception 'Bu işlem için Antrenör yetkisi gereklidir';
  end if;

  return query
  select
    student.id,
    student.full_name,
    student.birth_date,
    student.birth_year,
    student.position as player_position,
    student.enrollment_date,
    student.attendance_rate,
    training_group.name
  from public.students as student
  left join public.training_groups as training_group on training_group.id = student.group_id
  where student.school_id = target_school_id
  order by student.id;
end;
$$;

revoke all on function public.coach_student_directory(uuid) from public;
grant execute on function public.coach_student_directory(uuid) to authenticated;

drop policy if exists "coaches can manage attendance sessions" on public.attendance_sessions;
create policy "coaches can manage attendance sessions"
on public.attendance_sessions for all to authenticated
using (public.is_school_coach(school_id))
with check (public.is_school_coach(school_id));

drop policy if exists "coaches can view attendance records" on public.attendance_records;
create policy "coaches can view attendance records"
on public.attendance_records for select to authenticated
using (
  exists (
    select 1
    from public.attendance_sessions as session
    where session.id = attendance_records.session_id
      and public.is_school_coach(session.school_id)
  )
);

drop policy if exists "coaches can manage attendance records" on public.attendance_records;
create policy "coaches can manage attendance records"
on public.attendance_records for all to authenticated
using (
  exists (
    select 1
    from public.attendance_sessions as session
    where session.id = attendance_records.session_id
      and public.is_school_coach(session.school_id)
  )
)
with check (
  exists (
    select 1
    from public.attendance_sessions as session
    where session.id = attendance_records.session_id
      and public.is_school_coach(session.school_id)
  )
);

create or replace function public.approve_access_request(
  target_request_id bigint,
  approved_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.access_requests%rowtype;
begin
  if approved_role not in ('admin', 'coach', 'parent') then
    raise exception 'Geçersiz kullanıcı rolü';
  end if;

  select *
  into request_row
  from public.access_requests
  where id = target_request_id
  for update;

  if request_row.id is null then
    raise exception 'Erişim talebi bulunamadı';
  end if;

  if not public.is_school_super_admin(request_row.school_id) then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
  end if;

  if request_row.email_verified_at is null then
    raise exception 'E-posta adresi doğrulanmadan kullanıcı onaylanamaz';
  end if;

  insert into public.profiles (id, school_id, full_name, role)
  values (request_row.user_id, request_row.school_id, request_row.full_name, approved_role)
  on conflict (id) do update
  set
    school_id = excluded.school_id,
    full_name = excluded.full_name,
    role = excluded.role,
    updated_at = now();

  if approved_role = 'parent' then
    update public.students
    set guardian_user_id = request_row.user_id
    where school_id = request_row.school_id
      and email is not null
      and lower(btrim(email)) = lower(btrim(request_row.email));
  else
    update public.students
    set guardian_user_id = null
    where school_id = request_row.school_id
      and guardian_user_id = request_row.user_id;
  end if;

  update public.access_requests
  set
    requested_role = approved_role,
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = request_row.id;
end;
$$;

revoke all on function public.approve_access_request(bigint, text) from public;
grant execute on function public.approve_access_request(bigint, text) to authenticated;
