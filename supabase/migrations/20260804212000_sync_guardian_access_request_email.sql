create or replace function public.sync_guardian_access_request_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not distinct from old.email
    or nullif(btrim(new.email), '') is null then
    return new;
  end if;

  if old.guardian_user_id is not null then
    update public.access_requests
    set
      email = btrim(new.email),
      email_verified_at = null
    where school_id = new.school_id
      and user_id = old.guardian_user_id
      and requested_role = 'parent';
  end if;

  return new;
end;
$$;

drop trigger if exists students_sync_guardian_access_request_email on public.students;
create trigger students_sync_guardian_access_request_email
after update of email on public.students
for each row execute function public.sync_guardian_access_request_email();

revoke all on function public.sync_guardian_access_request_email() from public;
