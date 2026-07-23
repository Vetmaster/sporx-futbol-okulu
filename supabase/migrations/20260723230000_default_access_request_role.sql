create or replace function public.create_access_request_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_school_id uuid;
  requested_role text;
begin
  if coalesce(new.raw_user_meta_data ->> 'access_request', 'false') <> 'true' then
    return new;
  end if;

  requested_role := coalesce(new.raw_user_meta_data ->> 'requested_role', 'parent');
  if requested_role not in ('admin', 'parent') then
    requested_role := 'parent';
  end if;

  select id into target_school_id
  from public.schools
  where slug = 'sasa-futbol'
  limit 1;

  if target_school_id is null then
    raise exception 'Sasa Futbol okul kaydı bulunamadı';
  end if;

  insert into public.access_requests (
    user_id,
    school_id,
    email,
    full_name,
    requested_role
  )
  values (
    new.id,
    target_school_id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    requested_role
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
