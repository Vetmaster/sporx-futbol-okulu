alter table public.notifications
  add column if not exists recipient_count integer,
  add column if not exists delivered_count integer,
  add column if not exists read_count integer not null default 0;

update public.notifications notification
set read_count = (
  select count(*)::integer
  from public.notification_reads reads
  where reads.notification_id = notification.id
);

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
    from public.notification_reads
    where notification_id = target_notification_id
  )
  where id = target_notification_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists notification_reads_sync_count on public.notification_reads;
create trigger notification_reads_sync_count
after insert or delete on public.notification_reads
for each row execute function public.sync_notification_read_count();
