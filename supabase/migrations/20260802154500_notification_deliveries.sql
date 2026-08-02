create table if not exists public.notification_deliveries (
  notification_id bigint not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists notification_deliveries_user_id_idx
  on public.notification_deliveries (user_id, delivered_at desc);

alter table public.notification_deliveries enable row level security;

create or replace function public.sync_notification_read_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_notification_id bigint := coalesce(new.notification_id, old.notification_id);
begin
  update public.notifications
  set read_count = (
    select count(*)::integer
    from public.notification_reads reads
    join public.notification_deliveries deliveries
      on deliveries.notification_id = reads.notification_id
     and deliveries.user_id = reads.user_id
    where reads.notification_id = target_notification_id
  )
  where id = target_notification_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists notification_deliveries_sync_read_count on public.notification_deliveries;
create trigger notification_deliveries_sync_read_count
after insert or delete on public.notification_deliveries
for each row execute function public.sync_notification_read_count();

update public.notifications notification
set read_count = (
  select count(*)::integer
  from public.notification_reads reads
  join public.notification_deliveries deliveries
    on deliveries.notification_id = reads.notification_id
   and deliveries.user_id = reads.user_id
  where reads.notification_id = notification.id
);
