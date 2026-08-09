alter table public.profiles
  alter column school_id drop not null;

alter table public.profiles
  drop constraint if exists profiles_school_assignment_check;

update public.profiles
set school_id = null
where role = 'super_admin';

alter table public.profiles
  add constraint profiles_school_assignment_check
  check (
    (role = 'super_admin' and school_id is null)
    or (role <> 'super_admin' and school_id is not null)
  );
