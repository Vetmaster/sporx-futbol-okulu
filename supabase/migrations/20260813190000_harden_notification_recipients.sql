create table if not exists public.notification_recipients (
  notification_id bigint not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists notification_recipients_user_idx
  on public.notification_recipients (user_id, created_at desc);

alter table public.notification_recipients enable row level security;

create or replace function public.can_view_notification(target_notification_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notifications notification
    where notification.id = target_notification_id
      and (
        public.is_school_admin(notification.school_id)
        or exists (
          select 1
          from public.notification_recipients recipient
          where recipient.notification_id = notification.id
            and recipient.user_id = auth.uid()
        )
      )
  )
$$;

revoke all on function public.can_view_notification(bigint) from public;
grant execute on function public.can_view_notification(bigint) to authenticated;

drop policy if exists "users can view own notification recipients" on public.notification_recipients;
create policy "users can view own notification recipients"
on public.notification_recipients for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.notifications notification
    where notification.id = notification_recipients.notification_id
      and public.is_school_admin(notification.school_id)
  )
);

grant select on public.notification_recipients to authenticated;

insert into public.notification_recipients (notification_id, user_id)
select delivery.notification_id, delivery.user_id
from public.notification_deliveries delivery
on conflict (notification_id, user_id) do nothing;

drop policy if exists "members can view notifications" on public.notifications;
drop policy if exists "members can view notifications after approval" on public.notifications;
create policy "recipients and admins can view notifications"
on public.notifications for select to authenticated
using (public.can_view_notification(id));

drop policy if exists "users can mark own school notifications read" on public.notification_reads;
drop policy if exists "users can mark visible notifications read" on public.notification_reads;
create policy "users can mark received notifications read"
on public.notification_reads for insert to authenticated
with check (
  user_id = auth.uid()
  and public.can_view_notification(notification_id)
);

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
  where notification.id = any(notification_ids)
    and public.can_view_notification(notification.id)
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
    and public.can_view_notification(notification.id);

  return query
  select notification.id, notification.read_count
  from public.notifications notification
  where notification.id = any(notification_ids)
    and public.can_view_notification(notification.id);
end;
$$;

revoke all on function public.mark_notifications_read_and_get_counts(bigint[]) from public;
grant execute on function public.mark_notifications_read_and_get_counts(bigint[]) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_recipients'
  ) then
    alter publication supabase_realtime add table public.notification_recipients;
  end if;
end
$$;

comment on table public.notification_recipients is
  'Uygulama içi bildirim görünürlüğünü push teslimatından bağımsız olarak sınırlar.';
