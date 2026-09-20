create or replace function public.save_training_attendance(
  target_school_id uuid,
  target_training_id bigint,
  student_ids bigint[],
  present_student_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_session_id bigint;
begin
  if auth.uid() is null or not (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'super_admin'
    )
    or exists (
      select 1
      from public.school_user_memberships membership
      where membership.user_id = auth.uid()
        and membership.school_id = target_school_id
        and membership.role in ('admin', 'coach')
    )
  ) then
    raise exception 'Bu okulun yoklamasını kaydetme yetkiniz yok';
  end if;

  if not exists (
    select 1
    from public.trainings training
    where training.id = target_training_id
      and training.school_id = target_school_id
  ) then
    raise exception 'Antrenman seçili okula ait değil';
  end if;

  if student_ids is null or present_student_ids is null
     or cardinality(student_ids) = 0
     or cardinality(student_ids) <> (
       select count(distinct id) from unnest(student_ids) as id
     )
     or exists (
       select 1 from unnest(present_student_ids) as id
       where id is null or id <> all(student_ids)
     )
     or exists (
       select 1 from unnest(student_ids) as id
       left join public.students student on student.id = id
       where id is null
         or student.id is null
         or student.school_id <> target_school_id
         or coalesce(student.is_active, true) is false
     ) then
    raise exception 'Yoklama öğrenci listesi geçersiz';
  end if;

  insert into public.attendance_sessions (school_id, training_id, taken_by, taken_at)
  values (target_school_id, target_training_id, auth.uid(), now())
  on conflict (training_id) do update
    set taken_by = excluded.taken_by,
        taken_at = excluded.taken_at
  returning id into saved_session_id;

  insert into public.attendance_records (session_id, student_id, present)
  select saved_session_id, id, id = any(present_student_ids)
  from unnest(student_ids) as id
  on conflict (session_id, student_id) do update
    set present = excluded.present;

  delete from public.attendance_records attendance_record
  where attendance_record.session_id = saved_session_id
    and not (attendance_record.student_id = any(student_ids));

  return saved_session_id;
end;
$$;

revoke all on function public.save_training_attendance(uuid, bigint, bigint[], bigint[]) from public;
grant execute on function public.save_training_attendance(uuid, bigint, bigint[], bigint[]) to authenticated;
