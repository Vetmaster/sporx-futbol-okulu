create table if not exists public.system_email_logs (
  id bigserial primary key,
  school_id uuid references public.schools(id) on delete set null,
  recipient_email text not null,
  recipient_name text,
  email_type text not null,
  subject text not null,
  status text not null default 'sent' check (status in ('sent', 'queued', 'failed', 'skipped')),
  provider text not null default 'supabase_auth',
  sent_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.system_email_logs enable row level security;

create index if not exists system_email_logs_created_at_idx
  on public.system_email_logs (created_at desc);

create index if not exists system_email_logs_school_id_idx
  on public.system_email_logs (school_id);

drop policy if exists "super admins can view system email logs" on public.system_email_logs;
create policy "super admins can view system email logs"
on public.system_email_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
  )
);

revoke all on public.system_email_logs from public, anon;
grant select on public.system_email_logs to authenticated;
