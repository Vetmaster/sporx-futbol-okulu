alter table public.students
  add column if not exists profile_photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-profile-photos',
  'student-profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "school users can view student profile photos" on storage.objects;
create policy "school users can view student profile photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'student-profile-photos'
  and (
    public.is_platform_super_admin()
    or (
      (storage.foldername(name))[1] = public.current_school_id()::text
      and public.current_user_role() in ('admin', 'coach')
    )
    or exists (
      select 1
      from public.students
      where students.school_id::text = (storage.foldername(name))[1]
        and students.id::text = (storage.foldername(name))[2]
        and students.guardian_user_id = auth.uid()
    )
  )
);

drop policy if exists "admins can upload student profile photos" on storage.objects;
create policy "admins can upload student profile photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'student-profile-photos'
  and array_length(storage.foldername(name), 1) >= 2
  and (
    public.is_platform_super_admin()
    or (
      (storage.foldername(name))[1] = public.current_school_id()::text
      and public.current_user_role() = 'admin'
    )
  )
);

drop policy if exists "admins can update student profile photos" on storage.objects;
create policy "admins can update student profile photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'student-profile-photos'
  and (
    public.is_platform_super_admin()
    or (
      (storage.foldername(name))[1] = public.current_school_id()::text
      and public.current_user_role() = 'admin'
    )
  )
)
with check (
  bucket_id = 'student-profile-photos'
  and (
    public.is_platform_super_admin()
    or (
      (storage.foldername(name))[1] = public.current_school_id()::text
      and public.current_user_role() = 'admin'
    )
  )
);

drop policy if exists "admins can delete student profile photos" on storage.objects;
create policy "admins can delete student profile photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'student-profile-photos'
  and (
    public.is_platform_super_admin()
    or (
      (storage.foldername(name))[1] = public.current_school_id()::text
      and public.current_user_role() = 'admin'
    )
  )
);
