create or replace function public.delete_school(target_school_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_school_id uuid;
begin
  if not public.is_platform_super_admin() then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
  end if;

  delete from public.schools
  where id = target_school_id
  returning id into deleted_school_id;

  if deleted_school_id is null then
    raise exception 'Okul bulunamadı';
  end if;

  return deleted_school_id;
end;
$$;

revoke all on function public.delete_school(uuid) from public;
grant execute on function public.delete_school(uuid) to authenticated;
