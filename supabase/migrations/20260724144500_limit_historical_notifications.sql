alter table public.profiles
add column notifications_visible_from timestamptz not null default now();

-- Preserve the complete notification history for users who already existed
-- when this privacy rule was introduced. New profiles keep the default value.
update public.profiles
set notifications_visible_from = timestamptz '1970-01-01 00:00:00+00';

drop policy "members can view notifications" on public.notifications;

create policy "members can view notifications after approval"
on public.notifications for select to authenticated
using (
  school_id = public.current_school_id()
  and created_at >= (
    select profile.notifications_visible_from
    from public.profiles as profile
    where profile.id = auth.uid()
  )
);

