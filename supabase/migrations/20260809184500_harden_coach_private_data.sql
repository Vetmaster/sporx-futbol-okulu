drop policy if exists "staff and guardians can view students" on public.students;
create policy "staff and guardians can view students"
on public.students for select to authenticated
using (
  public.is_school_staff(school_id)
  or (
    public.current_user_role() = 'parent'
    and guardian_user_id = auth.uid()
  )
);

drop policy if exists "staff and guardians can view fees" on public.fee_periods;
create policy "staff and guardians can view fees"
on public.fee_periods for select to authenticated
using (
  public.is_school_staff(school_id)
  or (
    public.current_user_role() = 'parent'
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
    )
  )
);

create or replace function public.school_overview()
returns table (
  id uuid,
  name text,
  slug text,
  is_active boolean,
  monthly_fee_amount numeric,
  student_count bigint,
  active_student_count bigint,
  admin_count bigint,
  unpaid_total numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    school.id,
    school.name,
    school.slug,
    school.is_active,
    school.monthly_fee_amount,
    (select count(*) from public.students student where student.school_id = school.id),
    (select count(distinct fee.student_id) from public.fee_periods fee where fee.school_id = school.id and fee.status in ('late', 'paid') and fee.fee_month = date_trunc('month', current_date)::date),
    (select count(*) from public.profiles profile where profile.school_id = school.id and profile.role = 'admin'),
    coalesce((select sum(coalesce(fee.amount, school.monthly_fee_amount)) from public.fee_periods fee where fee.school_id = school.id and fee.status = 'late'), 0),
    school.created_at
  from public.schools school
  where public.current_user_role() in ('super_admin', 'admin')
    and (
      public.is_platform_super_admin()
      or school.id = public.current_school_id()
    )
  order by school.name;
$$;
