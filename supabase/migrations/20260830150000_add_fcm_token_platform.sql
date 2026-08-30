-- Android ve web FCM tokenları aynı tabloda, platform bilgisi ile saklanır.
alter table public.fcm_tokens
  add column if not exists platform text not null default 'android';

alter table public.fcm_tokens
  drop constraint if exists fcm_tokens_platform_check;

alter table public.fcm_tokens
  add constraint fcm_tokens_platform_check check (platform in ('android', 'web'));

create index if not exists fcm_tokens_user_platform_idx
  on public.fcm_tokens (user_id, platform);

create or replace function public.register_fcm_token(
  fcm_registration_token text,
  fcm_device_name text,
  fcm_platform text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  registered_token_id bigint;
  normalized_platform text := lower(coalesce(nullif(trim(fcm_platform), ''), 'android'));
begin
  if auth.uid() is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if nullif(trim(fcm_registration_token), '') is null then
    raise exception 'Firebase cihaz anahtarı eksik.';
  end if;

  if normalized_platform not in ('android', 'web') then
    raise exception 'Geçersiz Firebase cihaz platformu.';
  end if;

  -- Aynı cihazdaki token, hesap değişirse yalnızca aktif kullanıcıya devredilir.
  delete from public.fcm_tokens where token = fcm_registration_token;

  insert into public.fcm_tokens (user_id, token, platform, device_name, updated_at)
  values (auth.uid(), fcm_registration_token, normalized_platform, fcm_device_name, now())
  returning id into registered_token_id;

  return registered_token_id;
end;
$$;

-- Eski Android uygulama sürümleri iki parametreli çağrı yapmaya devam edebilir.
create or replace function public.register_fcm_token(
  fcm_registration_token text,
  fcm_device_name text default null
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select public.register_fcm_token(fcm_registration_token, fcm_device_name, 'android');
$$;

revoke all on function public.register_fcm_token(text, text, text) from public;
grant execute on function public.register_fcm_token(text, text, text) to authenticated;
revoke all on function public.register_fcm_token(text, text) from public;
grant execute on function public.register_fcm_token(text, text) to authenticated;
