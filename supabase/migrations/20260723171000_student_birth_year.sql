alter table public.students
add column birth_year smallint
check (birth_year is null or birth_year between 1990 and 2100);

