-- Antrenörler yalnızca kendi okullarında antrenman oluşturabilir ve güncelleyebilir.
-- Silme ve antrenman ayarları yönetimi admin yetkisinde kalır.
drop policy if exists "coaches can create trainings" on public.trainings;
create policy "coaches can create trainings"
  on public.trainings
  for insert
  to authenticated
  with check (public.is_school_coach(school_id));

drop policy if exists "coaches can update trainings" on public.trainings;
create policy "coaches can update trainings"
  on public.trainings
  for update
  to authenticated
  using (public.is_school_coach(school_id))
  with check (public.is_school_coach(school_id));
