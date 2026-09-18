-- Coaches may delete trainings only in the school currently selected for them.
drop policy if exists "coaches can delete trainings" on public.trainings;
create policy "coaches can delete trainings"
  on public.trainings
  for delete
  to authenticated
  using (public.is_school_coach(school_id));
