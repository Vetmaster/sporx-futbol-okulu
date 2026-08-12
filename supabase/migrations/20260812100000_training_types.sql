create table if not exists public.training_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint training_types_name_check check (char_length(trim(name)) between 1 and 60),
  constraint training_types_school_name_key unique (school_id, name)
);

create index if not exists training_types_school_sort_idx
  on public.training_types (school_id, sort_order, name);

alter table public.training_types enable row level security;

drop policy if exists "school members can view training types" on public.training_types;
create policy "school members can view training types"
  on public.training_types
  for select
  to authenticated
  using (
    public.is_platform_super_admin()
    or (
      school_id = public.current_school_id()
      and public.school_subscription_allows_access(school_id)
    )
  );

drop policy if exists "school admins can manage training types" on public.training_types;
create policy "school admins can manage training types"
  on public.training_types
  for all
  to authenticated
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

grant select, insert, update, delete on public.training_types to authenticated;

insert into public.training_types (school_id, name, sort_order)
select schools.id, defaults.name, defaults.sort_order
from public.schools
cross join (
  values
    ('Teknik Antrenman', 1),
    ('Taktik Çalışma', 2),
    ('Kondisyon', 3),
    ('Kaleci Çalışması', 4),
    ('Maç Hazırlığı', 5)
) as defaults(name, sort_order)
on conflict (school_id, name) do nothing;

create or replace function public.seed_default_training_types()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.training_types (school_id, name, sort_order)
  values
    (new.id, 'Teknik Antrenman', 1),
    (new.id, 'Taktik Çalışma', 2),
    (new.id, 'Kondisyon', 3),
    (new.id, 'Kaleci Çalışması', 4),
    (new.id, 'Maç Hazırlığı', 5)
  on conflict (school_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_default_training_types_after_school_insert on public.schools;
create trigger seed_default_training_types_after_school_insert
  after insert on public.schools
  for each row execute function public.seed_default_training_types();

comment on table public.training_types is 'Okula özel, yeni antrenman formunda önerilen antrenman isimleri.';
