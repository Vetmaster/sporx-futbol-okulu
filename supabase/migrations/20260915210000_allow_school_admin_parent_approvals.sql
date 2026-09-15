create or replace function public.approve_access_request(
  target_request_id bigint,
  approved_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.access_requests%rowtype;
  existing_profile public.profiles%rowtype;
begin
  if approved_role not in ('admin', 'coach', 'parent') then
    raise exception 'Geçersiz kullanıcı rolü';
  end if;

  select * into request_row
  from public.access_requests
  where id = target_request_id
  for update;

  if request_row.id is null then raise exception 'Erişim talebi bulunamadı'; end if;

  if public.is_school_super_admin(request_row.school_id) then
    null;
  elsif public.is_school_admin(request_row.school_id)
    and request_row.requested_role = 'parent'
    and approved_role = 'parent' then
    null;
  else
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  if request_row.email_verified_at is null then
    raise exception 'E-posta adresi doğrulanmadan kullanıcı onaylanamaz';
  end if;

  insert into public.school_user_memberships (user_id, school_id, full_name, role)
  values (request_row.user_id, request_row.school_id, request_row.full_name, approved_role)
  on conflict (user_id, school_id) do update
  set full_name = excluded.full_name, role = excluded.role, updated_at = now();

  select * into existing_profile from public.profiles where id = request_row.user_id;
  if existing_profile.id is null then
    insert into public.profiles (id, school_id, full_name, role)
    values (request_row.user_id, request_row.school_id, request_row.full_name, approved_role);
  elsif existing_profile.role <> 'super_admin' and existing_profile.school_id = request_row.school_id then
    update public.profiles
    set full_name = request_row.full_name, role = approved_role, updated_at = now()
    where id = request_row.user_id;
  end if;

  if approved_role = 'parent' then
    update public.students
    set guardian_user_id = request_row.user_id
    where school_id = request_row.school_id
      and email is not null
      and lower(btrim(email)) = lower(btrim(request_row.email));
  else
    update public.students
    set guardian_user_id = null
    where school_id = request_row.school_id
      and guardian_user_id = request_row.user_id;
  end if;

  update public.access_requests
  set requested_role = approved_role,
      status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = request_row.id;
end;
$$;

revoke all on function public.approve_access_request(bigint, text) from public;
grant execute on function public.approve_access_request(bigint, text) to authenticated;
