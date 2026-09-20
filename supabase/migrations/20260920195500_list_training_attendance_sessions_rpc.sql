create or replace function public.list_training_attendance_sessions(
  target_school_id uuid,
  target_training_ids bigint[] default null,
  from_taken_at timestamptz default null,
  to_taken_at timestamptz default null
)
returns table (
  id bigint,
  training_id bigint,
  taken_at timestamptz,
  attendance_records jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select session.id,
         session.training_id,
         session.taken_at,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'student_id', record.student_id,
               'present', record.present
             )
             order by record.student_id
           ) filter (where record.student_id is not null),
           '[]'::jsonb
         ) as attendance_records
  from public.attendance_sessions session
  join public.trainings training
    on training.id = session.training_id
   and training.school_id = session.school_id
  left join public.attendance_records record
    on record.session_id = session.id
  where session.school_id = target_school_id
    and (
      target_training_ids is null
      or session.training_id = any(target_training_ids)
    )
    and (from_taken_at is null or session.taken_at >= from_taken_at)
    and (to_taken_at is null or session.taken_at < to_taken_at)
    and (
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
      or exists (
        select 1
        from public.students student
        where student.school_id = target_school_id
          and student.group_id = training.group_id
          and student.guardian_user_id = auth.uid()
      )
    )
  group by session.id, session.training_id, session.taken_at
  order by session.taken_at desc;
$$;

revoke all on function public.list_training_attendance_sessions(uuid, bigint[], timestamptz, timestamptz) from public;
grant execute on function public.list_training_attendance_sessions(uuid, bigint[], timestamptz, timestamptz) to authenticated;
