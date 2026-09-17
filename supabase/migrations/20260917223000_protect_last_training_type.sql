-- Keep one training type per school, while still allowing it to be renamed.
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
    return old;
  end if;

  execute format('select count(*) from public.%I where school_id = $1', tg_table_name)
    into item_count using old.school_id;
  if item_count <= 1 then
    item_label := case tg_table_name
      when 'training_groups' then 'grup'
      when 'training_types' then 'antrenman türü'
      when 'training_coaches' then 'antrenör'
      when 'training_fields' then 'saha'
    end;
    raise exception 'Okuldaki son % silinemez.', item_label;
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_last_training_type_delete on public.training_types;
create trigger prevent_last_training_type_delete
  before delete on public.training_types
  for each row execute function public.prevent_last_school_training_setting_delete();
