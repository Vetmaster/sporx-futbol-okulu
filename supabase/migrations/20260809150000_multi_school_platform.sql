alter table public.schools
  add column if not exists is_active boolean not null default true;

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  )
$$;

create or replace function public.is_school_staff(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_super_admin()
    or (
      public.current_school_id() = target_school_id
      and public.current_user_role() in ('admin', 'staff')
    )
$$;

create or replace function public.is_school_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_super_admin()
    or (
      public.current_school_id() = target_school_id
      and public.current_user_role() = 'admin'
    )
$$;

create or replace function public.is_school_super_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_super_admin()
$$;

revoke all on function public.is_platform_super_admin() from public;
grant execute on function public.is_platform_super_admin() to authenticated;

drop policy if exists "school members can view school" on public.schools;
create policy "school members and platform admins can view schools"
on public.schools for select to authenticated
using (id = public.current_school_id() or public.is_platform_super_admin());

drop policy if exists "platform super admins can manage schools" on public.schools;
create policy "platform super admins can manage schools"
on public.schools for all to authenticated
using (public.is_platform_super_admin())
with check (public.is_platform_super_admin());

drop policy if exists "members can view notifications after approval" on public.notifications;
create policy "members can view notifications after approval"
on public.notifications for select to authenticated
using (
  public.is_platform_super_admin()
  or (
    school_id = public.current_school_id()
    and created_at >= (
      select profile.notifications_visible_from
      from public.profiles as profile
      where profile.id = auth.uid()
    )
  )
);

drop policy if exists "users can mark own school notifications read" on public.notification_reads;
create policy "users can mark visible notifications read"
on public.notification_reads for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.notifications
    where notifications.id = notification_reads.notification_id
      and (
        notifications.school_id = public.current_school_id()
        or public.is_platform_super_admin()
      )
  )
);

create or replace function public.create_school(
  school_name text,
  school_slug text,
  initial_monthly_fee numeric default 1500
)
returns public.schools
language plpgsql
security definer
set search_path = public
as $$
declare
  created_school public.schools%rowtype;
  normalized_name text := btrim(school_name);
  normalized_slug text := lower(btrim(school_slug));
begin
  if not public.is_platform_super_admin() then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 120 then
    raise exception 'Geçerli bir okul adı girin';
  end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(normalized_slug) > 80 then
    raise exception 'Okul kodu yalnızca küçük harf, rakam ve tire içerebilir';
  end if;
  if initial_monthly_fee <= 0 then
    raise exception 'Aylık aidat tutarı sıfırdan büyük olmalıdır';
  end if;

  insert into public.schools (name, slug, monthly_fee_amount)
  values (normalized_name, normalized_slug, initial_monthly_fee)
  returning * into created_school;

  insert into public.training_groups (school_id, name, sort_order)
  select created_school.id, group_row.name, group_row.sort_order
  from (values
    ('Saat 09:00', 1),
    ('Saat 10:00', 2),
    ('Saat 11:00', 3),
    ('Saat 12:00', 4),
    ('U11', 5),
    ('U12', 6),
    ('U13', 7),
    ('U14', 8)
  ) as group_row(name, sort_order);

  return created_school;
end;
$$;

create or replace function public.update_school(
  target_school_id uuid,
  school_name text,
  active boolean
)
returns public.schools
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_school public.schools%rowtype;
  normalized_name text := btrim(school_name);
begin
  if not public.is_platform_super_admin() then
    raise exception 'Bu işlem için Süper Admin yetkisi gereklidir';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 120 then
    raise exception 'Geçerli bir okul adı girin';
  end if;

  update public.schools
  set name = normalized_name, is_active = active
  where id = target_school_id
  returning * into updated_school;

  if updated_school.id is null then
    raise exception 'Okul bulunamadı';
  end if;
  return updated_school;
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
  select
    school.id,
    school.name,
    school.slug,
    school.is_active,
    school.monthly_fee_amount,
    (select count(*) from public.students student where student.school_id = school.id),
    (select count(distinct fee.student_id) from public.fee_periods fee where fee.school_id = school.id and fee.status in ('late', 'paid') and fee.fee_month = date_trunc('month', current_date)::date),
    (select count(*) from public.profiles profile where profile.school_id = school.id and profile.role = 'admin'),
    coalesce((select sum(coalesce(fee.amount, school.monthly_fee_amount)) from public.fee_periods fee where fee.school_id = school.id and fee.status = 'late'), 0),
    school.created_at
  from public.schools school
  where public.is_platform_super_admin()
     or school.id = public.current_school_id()
  order by school.name;
$$;

create or replace function public.mark_notifications_read_and_get_counts(notification_ids bigint[])
returns table (notification_id bigint, read_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_reads (notification_id, user_id, read_at)
  select notification.id, auth.uid(), now()
  from public.notifications notification
  join public.profiles profile on profile.id = auth.uid()
  where notification.id = any(notification_ids)
    and (
      public.is_platform_super_admin()
      or (
        notification.school_id = profile.school_id
        and notification.created_at >= profile.notifications_visible_from
      )
    )
  on conflict on constraint notification_reads_pkey
  do update set read_at = excluded.read_at;

  update public.notifications notification
  set read_count = (
    select count(*)::integer
    from public.notification_reads read_row
    join public.notification_deliveries delivery
      on delivery.notification_id = read_row.notification_id
     and delivery.user_id = read_row.user_id
    where read_row.notification_id = notification.id
  )
  where notification.id = any(notification_ids)
    and (notification.school_id = public.current_school_id() or public.is_platform_super_admin());

  return query
  select notification.id, notification.read_count
  from public.notifications notification
  where notification.id = any(notification_ids)
    and (notification.school_id = public.current_school_id() or public.is_platform_super_admin());
end;
$$;

revoke all on function public.create_school(text, text, numeric) from public;
revoke all on function public.update_school(uuid, text, boolean) from public;
revoke all on function public.school_overview() from public;
grant execute on function public.create_school(text, text, numeric) to authenticated;
grant execute on function public.update_school(uuid, text, boolean) to authenticated;
grant execute on function public.school_overview() to authenticated;
