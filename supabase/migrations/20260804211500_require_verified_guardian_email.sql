alter table public.access_requests
  add column if not exists email_verified_at timestamptz;

create or replace function public.set_initial_access_request_email_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_verified_at is null then
    select email_confirmed_at
    into new.email_verified_at
    from auth.users
    where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists access_requests_set_initial_email_verification on public.access_requests;
create trigger access_requests_set_initial_email_verification
before insert on public.access_requests
for each row execute function public.set_initial_access_request_email_verification();

create or replace function public.sync_access_request_email_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.access_requests
  set
    email = coalesce(new.email, email),
    email_verified_at = new.email_confirmed_at
  where user_id = new.id;

  return new;
end;
$$;

drop trigger if exists auth_users_sync_access_request_email_verification on auth.users;
create trigger auth_users_sync_access_request_email_verification
after update of email, email_confirmed_at on auth.users
for each row execute function public.sync_access_request_email_verification();

update public.access_requests as request
set email_verified_at = auth_user.email_confirmed_at
from auth.users as auth_user
where auth_user.id = request.user_id
  and auth_user.email_confirmed_at is not null;

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

  if request_row.email_verified_at is null then
    raise exception 'E-posta adresi doğrulanmadan kullanıcı onaylanamaz';
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

revoke all on function public.sync_access_request_email_verification() from public;
revoke all on function public.set_initial_access_request_email_verification() from public;
