-- school_onboardings is keyed by school_id; it does not have a separate id.
create or replace function public.approve_school_application_from_service(
  target_application_id uuid,
  applicant_user_id uuid,
  school_slug text,
  actor_user_id uuid
)
returns table (school_id uuid, onboarding_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  application_row public.school_applications%rowtype;
  created_school public.schools%rowtype;
  created_onboarding public.school_onboardings%rowtype;
  normalized_slug text := lower(btrim(school_slug));
begin
  select * into application_row from public.school_applications
  where id = target_application_id for update;
  if application_row.id is null then raise exception 'Başvuru bulunamadı'; end if;
  if application_row.status = 'APPROVED' and application_row.approved_school_id is not null then
    return query select application_row.approved_school_id, application_row.approved_school_id;
    return;
  end if;
  if application_row.status not in ('PENDING', 'INFO_REQUESTED') then raise exception 'Bu başvuru onaylanamaz'; end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Geçerli bir okul kodu oluşturulamadı'; end if;

  insert into public.schools (name, slug, monthly_fee_amount, subscription_status)
  values (application_row.school_name, normalized_slug, 1500, 'stopped')
  returning * into created_school;
  insert into public.training_groups (school_id, name, sort_order)
  select created_school.id, group_row.name, group_row.sort_order
  from (values ('Saat 09:00', 1), ('Saat 10:00', 2), ('Saat 11:00', 3), ('Saat 12:00', 4), ('U11', 5), ('U12', 6), ('U13', 7), ('U14', 8)) as group_row(name, sort_order);
  insert into public.school_user_memberships (user_id, school_id, full_name, role)
  values (applicant_user_id, created_school.id, application_row.applicant_name, 'admin')
  on conflict (user_id, school_id) do update set full_name = excluded.full_name, role = 'admin', updated_at = now();
  insert into public.profiles (id, school_id, full_name, role)
  values (applicant_user_id, created_school.id, application_row.applicant_name, 'admin')
  on conflict (id) do update set school_id = excluded.school_id, full_name = excluded.full_name, role = 'admin', updated_at = now()
  where public.profiles.role <> 'super_admin';
  insert into public.access_requests (user_id, school_id, email, full_name, requested_role, status, reviewed_by, reviewed_at)
  values (applicant_user_id, created_school.id, application_row.email, application_row.applicant_name, 'admin', 'approved', actor_user_id, now())
  on conflict (user_id, school_id) do update set status = 'approved', reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
  insert into public.school_onboardings (school_id, applicant_user_id, application_id)
  values (created_school.id, applicant_user_id, application_row.id)
  returning * into created_onboarding;
  update public.school_applications
  set status = 'APPROVED', reviewed_by = actor_user_id, reviewed_at = now(), approved_school_id = created_school.id, approved_user_id = applicant_user_id
  where id = application_row.id;
  return query select created_school.id, created_onboarding.school_id;
end;
$$;
revoke all on function public.approve_school_application_from_service(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.approve_school_application_from_service(uuid, uuid, text, uuid) to service_role;
