-- The original regular expression used an extra escape character, causing
-- otherwise valid addresses to be rejected by PostgreSQL.
alter table public.school_applications
  drop constraint if exists school_applications_email_check;

alter table public.school_applications
  add constraint school_applications_email_check
  check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
