create or replace function public.register_push_subscription(
  subscription_endpoint text,
  subscription_p256dh text,
  subscription_auth_secret text,
  subscription_user_agent text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  registered_subscription_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if nullif(trim(subscription_endpoint), '') is null
    or nullif(trim(subscription_p256dh), '') is null
    or nullif(trim(subscription_auth_secret), '') is null then
    raise exception 'Bildirim aboneliği eksik.';
  end if;

  -- Aynı tarayıcı endpoint'i daha önce başka bir hesapta kalmış olabilir.
  -- Endpoint yalnızca onu elinde bulunduran tarayıcı tarafından gönderilebilir;
  -- bu nedenle aktif oturumdaki kullanıcıya güvenle devredilir.
  delete from public.push_subscriptions
  where endpoint = subscription_endpoint;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_secret,
    user_agent,
    updated_at
  ) values (
    auth.uid(),
    subscription_endpoint,
    subscription_p256dh,
    subscription_auth_secret,
    subscription_user_agent,
    now()
  )
  returning id into registered_subscription_id;

  return registered_subscription_id;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text) from public;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
