-- Veli hesapları yalnızca bağlı öğrencilerinin grubuna ait antrenmanları ve
-- bu antrenmanların yoklama oturumlarını görebilir. Yönetici ve antrenör
-- erişimleri mevcut görev sınırları içinde korunur.
drop policy if exists "members can view trainings" on public.trainings;
create policy "authorized users can view trainings"
on public.trainings for select to authenticated
using (
  public.is_school_staff(school_id)
  or public.is_school_coach(school_id)
  or (
    public.current_user_role() = 'parent'
    and public.school_subscription_allows_access(school_id)
    and exists (
      select 1
      from public.students student
      where student.school_id = trainings.school_id
        and student.group_id = trainings.group_id
        and student.guardian_user_id = auth.uid()
    )
  )
);

drop policy if exists "members can view attendance sessions" on public.attendance_sessions;
create policy "authorized users can view attendance sessions"
on public.attendance_sessions for select to authenticated
using (
  public.is_school_staff(school_id)
  or public.is_school_coach(school_id)
  or (
    public.current_user_role() = 'parent'
    and public.school_subscription_allows_access(school_id)
    and exists (
      select 1
      from public.trainings training
      join public.students student
        on student.school_id = training.school_id
       and student.group_id = training.group_id
      where training.id = attendance_sessions.training_id
        and student.guardian_user_id = auth.uid()
    )
  )
);

comment on policy "authorized users can view trainings" on public.trainings is
  'Velileri yalnızca kendi öğrencilerinin grubuna ait antrenmanlarla sınırlar.';
