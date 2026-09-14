-- A school application email address can be used only once across all statuses.
-- This prevents a rejected or already approved applicant from opening another
-- school application with the same email address.

drop index if exists public.school_applications_one_open_email;

create unique index if not exists school_applications_one_email
  on public.school_applications (email);
