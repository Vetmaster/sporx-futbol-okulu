-- Every school starts with a field, while existing field names remain editable.
insert into public.training_fields (school_id, name, sort_order)
select school.id, 'Saha-1', 1
from public.schools as school
on conflict (school_id, name) do nothing;

create or replace function public.seed_default_training_field()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.training_fields (school_id, name, sort_order)
  values (new.id, 'Saha-1', 1)
  on conflict (school_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_default_training_field_after_school_insert on public.schools;
create trigger seed_default_training_field_after_school_insert
  after insert on public.schools
  for each row execute function public.seed_default_training_field();

-- Called only after the application has completed password setup or a normal login.
-- Merely opening an invitation link must not add a selectable coach.
create or replace function public.register_signed_in_training_coach()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.training_coaches (school_id, name, sort_order)
  select membership.school_id, btrim(membership.full_name), 0
  from public.school_user_memberships as membership
  where membership.user_id = (select auth.uid())
    and membership.role = 'coach'
    and char_length(btrim(membership.full_name)) between 2 and 80
    and not exists (
      select 1 from public.training_coaches as coach
      where coach.school_id = membership.school_id
        and lower(coach.name) = lower(btrim(membership.full_name))
    )
  on conflict (school_id, name) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count > 0;
end;
$$;

revoke all on function public.register_signed_in_training_coach() from public, anon;
grant execute on function public.register_signed_in_training_coach() to authenticated;

-- Serialize deletes within a school so two concurrent requests cannot remove
-- different rows and accidentally leave an empty list.
create or replace function public.prevent_last_school_training_setting_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_count bigint;
  item_label text;
begin
  perform 1 from public.schools where id = old.school_id for update;
  if not found then
    -- The school itself is being removed; allow its child rows to cascade.
    return old;
  end if;

  execute format('select count(*) from public.%I where school_id = $1', tg_table_name)
    into item_count using old.school_id;
  if item_count <= 1 then
    item_label := case tg_table_name
      when 'training_groups' then 'grup'
      when 'training_coaches' then 'antrenör'
      when 'training_fields' then 'saha'
    end;
    raise exception 'Okuldaki son % silinemez.', item_label;
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_last_training_group_delete on public.training_groups;
create trigger prevent_last_training_group_delete
  before delete on public.training_groups
  for each row execute function public.prevent_last_school_training_setting_delete();

drop trigger if exists prevent_last_training_coach_delete on public.training_coaches;
create trigger prevent_last_training_coach_delete
  before delete on public.training_coaches
  for each row execute function public.prevent_last_school_training_setting_delete();

drop trigger if exists prevent_last_training_field_delete on public.training_fields;
create trigger prevent_last_training_field_delete
  before delete on public.training_fields
  for each row execute function public.prevent_last_school_training_setting_delete();

do $$
begin
  alter publication supabase_realtime add table public.training_coaches;
exception when duplicate_object then null;
end;
$$;
