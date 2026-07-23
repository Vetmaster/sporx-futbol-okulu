do $$
declare
  target_table_name text;
begin
  foreach target_table_name in array array[
    'profiles',
    'training_groups',
    'students',
    'fee_periods',
    'trainings',
    'accounting_entries',
    'notifications',
    'attendance_sessions',
    'attendance_records',
    'access_requests'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table_name);
    end if;
  end loop;
end;
$$;
