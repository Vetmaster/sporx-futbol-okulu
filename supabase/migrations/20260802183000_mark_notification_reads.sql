create or replace function public.mark_notifications_read_and_get_counts(notification_ids bigint[])
returns table (notification_id bigint, read_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_reads (notification_id, user_id, read_at)
  select notifications.id, auth.uid(), now()
  from public.notifications notifications
  join public.notification_deliveries deliveries
    on deliveries.notification_id = notifications.id
   and deliveries.user_id = auth.uid()
  where notifications.id = any(notification_ids)
    and notifications.school_id = public.current_school_id()
  on conflict (notification_id, user_id)
  do update set read_at = excluded.read_at;

  update public.notifications notifications
  set read_count = (
    select count(*)::integer
    from public.notification_reads reads
    join public.notification_deliveries deliveries
      on deliveries.notification_id = reads.notification_id
     and deliveries.user_id = reads.user_id
    where reads.notification_id = notifications.id
  )
  where notifications.id = any(notification_ids)
    and notifications.school_id = public.current_school_id();

  return query
  select notifications.id, notifications.read_count
  from public.notifications notifications
  where notifications.id = any(notification_ids)
    and notifications.school_id = public.current_school_id();
end;
$$;

revoke all on function public.mark_notifications_read_and_get_counts(bigint[]) from public;
grant execute on function public.mark_notifications_read_and_get_counts(bigint[]) to authenticated;
