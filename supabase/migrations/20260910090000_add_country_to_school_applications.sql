-- Keep school applications location-aware while allowing KKTC applications
-- to omit a district.

alter table public.school_applications
  add column if not exists country text not null default 'Türkiye';

alter table public.school_applications
  drop constraint if exists school_applications_country_check;

alter table public.school_applications
  add constraint school_applications_country_check
  check (country in ('Türkiye', 'KKTC'));

alter table public.school_applications
  alter column district drop not null;
