create or replace function public.revoke_access_request_approval(target_request_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.access_requests%rowtype;
  target_role text;
begin
  select *
  into request_row
  from public.access_requests
  where id = target_request_id
  for update;

  if request_row.id is null then
    raise exception 'Erişim talebi bulunamadı';
  end if;

  if not public.is_school_super_admin(request_row.school_id) then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
  end if;

  if request_row.status <> 'approved' then
    raise exception 'Yalnızca onaylanmış kullanıcıların onayı kaldırılabilir';
  end if;

  select role
  into target_role
  from public.profiles
  where id = request_row.user_id
    and school_id = request_row.school_id;

  if target_role = 'super_admin' then
    raise exception 'Süper Admin erişimi bu ekrandan kaldırılamaz';
  end if;

  delete from public.profiles
  where id = request_row.user_id
    and school_id = request_row.school_id
    and role <> 'super_admin';

  update public.access_requests
  set
    status = 'pending',
    reviewed_by = null,
    reviewed_at = null
  where id = request_row.id;
end;
$$;

revoke all on function public.revoke_access_request_approval(bigint) from public;
grant execute on function public.revoke_access_request_approval(bigint) to authenticated;
