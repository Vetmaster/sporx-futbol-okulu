-- Save a complete attendance sheet in one transaction. The caller must be
-- school staff (including platform super admins) or a coach for this school.
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
  training_group_id uuid;
  saved_session_id bigint;
begin
  if auth.uid() is null or not (
    public.is_school_staff(target_school_id)
    or public.is_school_coach(target_school_id)
  ) then
    raise exception 'Bu okulun yoklamasını kaydetme yetkiniz yok';
  end if;

  select t.group_id into training_group_id
  from public.trainings t
  where t.id = target_training_id and t.school_id = target_school_id;
  if not found then
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
       left join public.students s on s.id = id
       where id is null or s.id is null
         or s.school_id <> target_school_id
         or s.group_id is distinct from training_group_id
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

  delete from public.attendance_records ar
  where ar.session_id = saved_session_id
    and not (ar.student_id = any(student_ids));

  return saved_session_id;
end;
$$;

revoke all on function public.save_training_attendance(uuid, bigint, bigint[], bigint[]) from public;
grant execute on function public.save_training_attendance(uuid, bigint, bigint[], bigint[]) to authenticated;
