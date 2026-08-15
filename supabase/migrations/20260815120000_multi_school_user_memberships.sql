create table public.school_user_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  role text not null check (role in ('admin', 'coach', 'parent')),
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, school_id)
);

create index school_user_memberships_school_role_idx
  on public.school_user_memberships (school_id, role);

create trigger school_user_memberships_set_updated_at
before update on public.school_user_memberships
for each row execute function public.set_updated_at();

insert into public.school_user_memberships (user_id, school_id, role, full_name, created_at, updated_at)
select profile.id, profile.school_id, profile.role, profile.full_name, profile.created_at, profile.updated_at
from public.profiles profile
where profile.school_id is not null
  and profile.role in ('admin', 'coach', 'parent')
on conflict (user_id, school_id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    updated_at = excluded.updated_at;

alter table public.school_user_memberships enable row level security;

create policy "users can view own school memberships"
on public.school_user_memberships for select to authenticated
using (user_id = auth.uid() or public.is_platform_super_admin());

revoke all on table public.school_user_memberships from public, anon, authenticated;
grant select on table public.school_user_memberships to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.school_user_memberships;
exception
  when duplicate_object then null;
end;
$$;

alter table public.access_requests
  drop constraint if exists access_requests_user_id_key;

alter table public.access_requests
  add constraint access_requests_user_school_key unique (user_id, school_id);

create or replace function public.my_school_memberships()
returns table (
  id uuid,
  name text,
  slug text,
  is_active boolean,
  subscription_status text,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select school.id,
         school.name,
         school.slug,
         school.is_active,
         school.subscription_status,
         membership.role
  from public.school_user_memberships membership
  join public.schools school on school.id = membership.school_id
  where membership.user_id = auth.uid()
  order by school.name;
$$;

create or replace function public.switch_user_school(target_school_id uuid)
returns table (school_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_membership public.school_user_memberships%rowtype;
  target_school public.schools%rowtype;
begin
  select * into target_membership
  from public.school_user_memberships
  where user_id = auth.uid()
    and school_user_memberships.school_id = target_school_id;

  if target_membership.user_id is null then
    raise exception 'Bu okul için kullanıcı yetkiniz bulunmuyor';
  end if;

  select * into target_school
  from public.schools
  where id = target_school_id;

  if target_school.id is null or target_school.is_active is false then
    raise exception 'Seçilen okul aktif değil';
  end if;

  if target_school.subscription_status = 'stopped' then
    raise exception 'SUBSCRIPTION_STOPPED';
  end if;

  update public.profiles
  set school_id = target_membership.school_id,
      role = target_membership.role,
      full_name = target_membership.full_name,
      updated_at = now()
  where id = auth.uid()
    and role <> 'super_admin';

  if not found then
    raise exception 'Aktif kullanıcı profili güncellenemedi';
  end if;

  return query select target_membership.school_id, target_membership.role;
end;
$$;

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
  if requested_role not in ('admin', 'coach', 'parent') then
    requested_role := 'parent';
  end if;

  select id into target_school_id
  from public.schools
  where slug = 'sasa-futbol'
  limit 1;

  if target_school_id is null then
    raise exception 'Sasa Futbol okul kaydı bulunamadı';
  end if;

  insert into public.access_requests (user_id, school_id, email, full_name, requested_role)
  values (
    new.id,
    target_school_id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    requested_role
  )
  on conflict (user_id, school_id) do nothing;

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
  if not public.is_school_super_admin(request_row.school_id) then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
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

create or replace function public.revoke_access_request_approval(target_request_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.access_requests%rowtype;
  profile_row public.profiles%rowtype;
  replacement public.school_user_memberships%rowtype;
begin
  select * into request_row
  from public.access_requests
  where id = target_request_id
  for update;

  if request_row.id is null then raise exception 'Erişim talebi bulunamadı'; end if;
  if not public.is_school_super_admin(request_row.school_id) then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
  end if;
  if request_row.status <> 'approved' then
    raise exception 'Yalnızca onaylanmış kullanıcıların onayı kaldırılabilir';
  end if;

  update public.students
  set guardian_user_id = null
  where school_id = request_row.school_id
    and guardian_user_id = request_row.user_id;

  delete from public.school_user_memberships
  where user_id = request_row.user_id
    and school_id = request_row.school_id;

  select * into profile_row from public.profiles where id = request_row.user_id;
  if profile_row.role <> 'super_admin' and profile_row.school_id = request_row.school_id then
    select * into replacement
    from public.school_user_memberships
    where user_id = request_row.user_id
    order by created_at
    limit 1;

    if replacement.user_id is null then
      delete from public.profiles where id = request_row.user_id;
    else
      update public.profiles
      set school_id = replacement.school_id,
          role = replacement.role,
          full_name = replacement.full_name,
          updated_at = now()
      where id = request_row.user_id;
    end if;
  end if;

  update public.access_requests
  set status = 'pending', reviewed_by = null, reviewed_at = null
  where id = request_row.id;
end;
$$;

create or replace function public.school_overview()
returns table (
  id uuid,
  name text,
  slug text,
  is_active boolean,
  monthly_fee_amount numeric,
  student_count bigint,
  active_student_count bigint,
  admin_count bigint,
  unpaid_total numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select school.id,
         school.name,
         school.slug,
         school.is_active,
         school.monthly_fee_amount,
         (select count(*) from public.students student where student.school_id = school.id),
         (select count(distinct fee.student_id) from public.fee_periods fee where fee.school_id = school.id and fee.status in ('late', 'paid') and fee.fee_month = date_trunc('month', current_date)::date),
         (select count(*) from public.school_user_memberships membership where membership.school_id = school.id and membership.role = 'admin'),
         coalesce((select sum(coalesce(fee.amount, school.monthly_fee_amount)) from public.fee_periods fee where fee.school_id = school.id and fee.status = 'late'), 0),
         school.created_at
  from public.schools school
  where public.current_user_role() in ('super_admin', 'admin')
    and (public.is_platform_super_admin() or school.id = public.current_school_id())
  order by school.name;
$$;

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

  with replacements as (
    select profile.id as user_id,
           replacement.school_id,
           replacement.role,
           replacement.full_name
    from public.profiles profile
    join lateral (
      select membership.school_id, membership.role, membership.full_name
      from public.school_user_memberships membership
      where membership.user_id = profile.id
        and membership.school_id <> target_school_id
      order by membership.created_at
      limit 1
    ) replacement on true
    where profile.school_id = target_school_id
      and profile.role <> 'super_admin'
  )
  update public.profiles profile
  set school_id = replacement.school_id,
      role = replacement.role,
      full_name = replacement.full_name,
      updated_at = now()
  from replacements replacement
  where profile.id = replacement.user_id;

  delete from public.schools
  where id = target_school_id
  returning id into deleted_school_id;

  if deleted_school_id is null then raise exception 'Okul bulunamadı'; end if;
  return deleted_school_id;
end;
$$;

revoke all on function public.my_school_memberships() from public;
revoke all on function public.switch_user_school(uuid) from public;
grant execute on function public.my_school_memberships() to authenticated;
grant execute on function public.switch_user_school(uuid) to authenticated;
