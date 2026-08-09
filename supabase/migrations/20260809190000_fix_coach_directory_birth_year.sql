drop function if exists public.coach_student_directory(uuid);

create function public.coach_student_directory(target_school_id uuid)
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
