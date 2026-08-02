update public.notifications notifications
set read_count = (
  select count(*)::integer
  from public.notification_reads reads
  join public.notification_deliveries deliveries
    on deliveries.notification_id = reads.notification_id
   and deliveries.user_id = reads.user_id
  where reads.notification_id = notifications.id
);
