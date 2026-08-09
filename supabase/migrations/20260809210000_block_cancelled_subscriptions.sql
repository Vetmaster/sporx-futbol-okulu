-- Cancelled schools remain manageable by platform Super Admins, but school users lose data access.
create or replace function public.school_subscription_allows_access(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_super_admin()
    or exists (
      select 1
      from public.schools
      where id = target_school_id
        and subscription_status <> 'cancelled'
    )
$$;

revoke all on function public.school_subscription_allows_access(uuid) from public;
grant execute on function public.school_subscription_allows_access(uuid) to authenticated;

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

create or replace function public.is_school_coach(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_school_id() = target_school_id
    and public.current_user_role() = 'coach'
    and public.school_subscription_allows_access(target_school_id)
$$;

drop policy if exists "members can view groups" on public.training_groups;
create policy "members can view groups"
on public.training_groups for select to authenticated
using (
  school_id = public.current_school_id()
  and public.school_subscription_allows_access(school_id)
);

drop policy if exists "members can view trainings" on public.trainings;
create policy "members can view trainings"
on public.trainings for select to authenticated
using (
  school_id = public.current_school_id()
  and public.school_subscription_allows_access(school_id)
);

drop policy if exists "members can view attendance sessions" on public.attendance_sessions;
create policy "members can view attendance sessions"
on public.attendance_sessions for select to authenticated
using (
  school_id = public.current_school_id()
  and public.school_subscription_allows_access(school_id)
);

drop policy if exists "staff and guardians can view students" on public.students;
create policy "staff and guardians can view students"
on public.students for select to authenticated
using (
  public.is_school_staff(school_id)
  or (
    public.school_subscription_allows_access(school_id)
    and public.current_user_role() = 'parent'
    and guardian_user_id = auth.uid()
  )
);

drop policy if exists "staff and guardians can view fees" on public.fee_periods;
create policy "staff and guardians can view fees"
on public.fee_periods for select to authenticated
using (
  public.is_school_staff(school_id)
  or (
    public.school_subscription_allows_access(school_id)
    and public.current_user_role() = 'parent'
    and exists (
      select 1
      from public.students
      where students.id = fee_periods.student_id
        and students.guardian_user_id = auth.uid()
    )
  )
);

drop policy if exists "staff and guardians can view attendance records" on public.attendance_records;
create policy "staff and guardians can view attendance records"
on public.attendance_records for select to authenticated
using (
  exists (
    select 1
    from public.attendance_sessions
    join public.trainings on trainings.id = attendance_sessions.training_id
    where attendance_sessions.id = attendance_records.session_id
      and public.is_school_staff(trainings.school_id)
  )
  or (
    public.current_user_role() = 'parent'
    and exists (
      select 1
      from public.students
      where students.id = attendance_records.student_id
        and students.guardian_user_id = auth.uid()
        and public.school_subscription_allows_access(students.school_id)
    )
  )
);

drop policy if exists "members can view notifications after approval" on public.notifications;
create policy "members can view notifications after approval"
on public.notifications for select to authenticated
using (
  public.is_platform_super_admin()
  or (
    school_id = public.current_school_id()
    and public.school_subscription_allows_access(school_id)
    and created_at >= (
      select profile.notifications_visible_from
      from public.profiles as profile
      where profile.id = auth.uid()
    )
  )
);

drop policy if exists "users can mark visible notifications read" on public.notification_reads;
create policy "users can mark visible notifications read"
on public.notification_reads for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.notifications
    where notifications.id = notification_reads.notification_id
      and (
        public.is_platform_super_admin()
        or (
          notifications.school_id = public.current_school_id()
          and public.school_subscription_allows_access(notifications.school_id)
        )
      )
  )
);
