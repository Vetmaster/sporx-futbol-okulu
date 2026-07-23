create or replace function public.create_access_request_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_school_id uuid;
  requested_role text;
begin
  if coalesce(new.raw_user_meta_data ->> 'access_request', 'false') <> 'true' then
    return new;
  end if;

  requested_role := coalesce(new.raw_user_meta_data ->> 'requested_role', 'parent');
  if requested_role not in ('admin', 'parent') then
    requested_role := 'parent';
  end if;

  select id into target_school_id
  from public.schools
  where slug = 'sasa-futbol'
  limit 1;

  if target_school_id is null then
    raise exception 'Sasa Futbol okul kaydı bulunamadı';
  end if;

  if not exists (
    select 1
    from public.students
    where school_id = target_school_id
      and email is not null
      and lower(btrim(email)) = lower(btrim(new.email))
  ) then
    raise exception 'Kayıtlı veli e-posta adresi bulunamadı';
  end if;

  insert into public.access_requests (
    user_id,
    school_id,
    email,
    full_name,
    requested_role
  )
  values (
    new.id,
    target_school_id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    requested_role
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

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
begin
  if approved_role not in ('admin', 'parent') then
    raise exception 'Geçersiz kullanıcı rolü';
  end if;

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

  insert into public.profiles (id, school_id, full_name, role)
  values (request_row.user_id, request_row.school_id, request_row.full_name, approved_role)
  on conflict (id) do update
  set
    school_id = excluded.school_id,
    full_name = excluded.full_name,
    role = excluded.role,
    updated_at = now();

  if approved_role = 'parent' then
    update public.students
    set guardian_user_id = request_row.user_id
    where school_id = request_row.school_id
      and email is not null
      and lower(btrim(email)) = lower(btrim(request_row.email));
  end if;

  update public.access_requests
  set
    requested_role = approved_role,
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = request_row.id;
end;
$$;

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

  update public.students
  set guardian_user_id = null
  where school_id = request_row.school_id
    and guardian_user_id = request_row.user_id;

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

update public.students as student
set guardian_user_id = request.user_id
from public.access_requests as request
join public.profiles as profile
  on profile.id = request.user_id
  and profile.school_id = request.school_id
  and profile.role = 'parent'
where request.status = 'approved'
  and student.school_id = request.school_id
  and student.guardian_user_id is null
  and student.email is not null
  and lower(btrim(student.email)) = lower(btrim(request.email));
