-- Antrenör, öğrenci profilindeki yalnızca aktif/pasif durumunu değiştirebilir.
-- Diğer öğrenci alanları bu dar kapsamlı güvenli fonksiyonla erişilemez.
create or replace function public.set_student_active_status(
  target_student_id bigint,
  next_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_school_id uuid;
begin
  select school_id
    into target_school_id
  from public.students
  where id = target_student_id;

  if target_school_id is null then
    raise exception 'Öğrenci bulunamadı';
  end if;

  if not public.is_school_coach(target_school_id) then
    raise exception 'Bu işlem için Antrenör yetkisi gereklidir';
  end if;

  update public.students
  set is_active = next_is_active
  where id = target_student_id
    and school_id = target_school_id;
end;
$$;

revoke all on function public.set_student_active_status(bigint, boolean) from public;
grant execute on function public.set_student_active_status(bigint, boolean) to authenticated;
