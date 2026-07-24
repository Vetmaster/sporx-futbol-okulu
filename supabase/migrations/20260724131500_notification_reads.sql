create table public.notification_reads (
  notification_id bigint not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index notification_reads_user_id_idx
  on public.notification_reads (user_id, read_at desc);

insert into public.notification_reads (notification_id, user_id, read_at)
select notifications.id, profiles.id, notifications.created_at
from public.notifications
join public.profiles on profiles.school_id = notifications.school_id
on conflict (notification_id, user_id) do nothing;

alter table public.notification_reads enable row level security;

create policy "users can view own notification reads"
on public.notification_reads for select to authenticated
using (user_id = auth.uid());

create policy "users can mark own school notifications read"
on public.notification_reads for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.notifications
    where notifications.id = notification_reads.notification_id
      and notifications.school_id = public.current_school_id()
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_reads'
  ) then
    alter publication supabase_realtime add table public.notification_reads;
  end if;
end;
$$;
