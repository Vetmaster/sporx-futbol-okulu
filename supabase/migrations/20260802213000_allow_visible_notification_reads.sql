create or replace function public.mark_notifications_read_and_get_counts(notification_ids bigint[])
returns table (notification_id bigint, read_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Okundu bilgisi, push teslimatından bağımsızdır. Bir yönetici gönderdiği
  -- bildirimi veya push aboneliği olmayan bir kullanıcı uygulama içindeki
  -- bildirimi açtığında da okuma kaydı kalıcı olmalıdır.
  insert into public.notification_reads (notification_id, user_id, read_at)
  select notifications.id, auth.uid(), now()
  from public.notifications notifications
  join public.profiles profile
    on profile.id = auth.uid()
   and profile.school_id = notifications.school_id
  where notifications.id = any(notification_ids)
    and notifications.school_id = public.current_school_id()
    and notifications.created_at >= profile.notifications_visible_from
  on conflict on constraint notification_reads_pkey
  do update set read_at = excluded.read_at;

  -- Yönetici metriklerinde yalnızca gerçekten teslim edilmiş kullanıcıların
  -- okumaları sayılmaya devam eder.
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
