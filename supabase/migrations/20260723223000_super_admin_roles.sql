alter table public.profiles
  drop constraint profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'staff', 'parent'));

alter table public.access_requests
  drop constraint access_requests_requested_role_check;

alter table public.access_requests
  add constraint access_requests_requested_role_check
  check (requested_role in ('admin', 'staff', 'parent'));

update public.access_requests
set requested_role = 'parent'
where status = 'pending'
  and requested_role = 'staff';

create or replace function public.is_school_staff(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_school_id() = target_school_id
    and public.current_user_role() in ('super_admin', 'admin', 'staff')
$$;

create or replace function public.is_school_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_school_id() = target_school_id
    and public.current_user_role() in ('super_admin', 'admin')
$$;

create or replace function public.is_school_super_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_school_id() = target_school_id
    and public.current_user_role() = 'super_admin'
$$;

revoke all on function public.is_school_super_admin(uuid) from public;
grant execute on function public.is_school_super_admin(uuid) to authenticated;

drop policy "admins can manage profiles" on public.profiles;
create policy "super admins can manage profiles"
on public.profiles for all to authenticated
using (public.is_school_super_admin(school_id))
with check (public.is_school_super_admin(school_id));

drop policy "admins can view school access requests" on public.access_requests;
create policy "super admins can view school access requests"
on public.access_requests for select to authenticated
using (public.is_school_super_admin(school_id));

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

  requested_role := new.raw_user_meta_data ->> 'requested_role';
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

  update public.access_requests
  set
    requested_role = approved_role,
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = request_row.id;
end;
$$;

create or replace function public.reject_access_request(target_request_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.access_requests%rowtype;
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

  update public.access_requests
  set
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = request_row.id;
end;
$$;

update public.profiles
set role = 'super_admin'
where id = (
  select id
  from auth.users
  where lower(email) = '00vetmaster00@gmail.com'
  limit 1
);
