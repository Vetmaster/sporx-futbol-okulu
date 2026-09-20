alter table public.school_applications
  add column if not exists address text;

alter table public.school_applications
  drop constraint if exists school_applications_address_length_check;

alter table public.school_applications
  add constraint school_applications_address_length_check
  check (address is null or char_length(btrim(address)) between 5 and 500);
