alter table public.students
  add column if not exists player_card jsonb;

alter table public.students
  drop constraint if exists students_player_card_check;

alter table public.students
  add constraint students_player_card_check
  check (
    player_card is null
    or (
      jsonb_typeof(player_card) = 'object'
      and jsonb_typeof(player_card -> 'overall') = 'number'
      and jsonb_typeof(player_card -> 'speed') = 'number'
      and jsonb_typeof(player_card -> 'shooting') = 'number'
      and jsonb_typeof(player_card -> 'passing') = 'number'
      and jsonb_typeof(player_card -> 'dribbling') = 'number'
      and jsonb_typeof(player_card -> 'defense') = 'number'
      and jsonb_typeof(player_card -> 'physical') = 'number'
      and (player_card ->> 'overall')::integer between 0 and 99
      and (player_card ->> 'speed')::integer between 0 and 99
      and (player_card ->> 'shooting')::integer between 0 and 99
      and (player_card ->> 'passing')::integer between 0 and 99
      and (player_card ->> 'dribbling')::integer between 0 and 99
      and (player_card ->> 'defense')::integer between 0 and 99
      and (player_card ->> 'physical')::integer between 0 and 99
    )
  );

comment on column public.students.player_card is
  'SASA-F oyuncu kartı performans puanları (0-99).';

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
  group_name text,
  player_card jsonb
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
    training_group.name,
    student.player_card
  from public.students as student
  left join public.training_groups as training_group on training_group.id = student.group_id
  where student.school_id = target_school_id
  order by student.id;
end;
$$;

revoke all on function public.coach_student_directory(uuid) from public;
grant execute on function public.coach_student_directory(uuid) to authenticated;
