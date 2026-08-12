create table if not exists public.training_coaches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint training_coaches_name_check check (char_length(trim(name)) between 2 and 80),
  constraint training_coaches_school_name_key unique (school_id, name)
);

create index if not exists training_coaches_school_sort_idx
  on public.training_coaches (school_id, sort_order, name);

alter table public.training_coaches enable row level security;

drop policy if exists "school members can view training coaches" on public.training_coaches;
create policy "school members can view training coaches"
  on public.training_coaches
  for select
  to authenticated
  using (
    public.is_platform_super_admin()
    or (
      school_id = public.current_school_id()
      and public.school_subscription_allows_access(school_id)
    )
  );

drop policy if exists "school admins can manage training coaches" on public.training_coaches;
create policy "school admins can manage training coaches"
  on public.training_coaches
  for all
  to authenticated
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

grant select, insert, update, delete on public.training_coaches to authenticated;

insert into public.training_coaches (school_id, name, sort_order)
select school_id, coach_name, (row_number() over (partition by school_id order by coach_name))::integer
from (
  select distinct school_id, trim(coach) as coach_name
  from public.trainings
  where coach is not null and trim(coach) <> ''
) as existing_coaches
on conflict (school_id, name) do nothing;

comment on table public.training_coaches is 'Okula özel, antrenman planlama formunda seçilen antrenör isimleri.';
