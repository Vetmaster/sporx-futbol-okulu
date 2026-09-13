create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('send-subscription-renewal-reminders');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'send-subscription-renewal-reminders',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://tezeflsiljqprrqbsypl.supabase.co/functions/v1/send-subscription-renewal-reminders',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
