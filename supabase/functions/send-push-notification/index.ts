import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return json({ error: 'Push service is not configured' }, 503);
  }

  const authorization = request.headers.get('Authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userResult.user) return json({ error: 'Unauthorized' }, 401);

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('school_id, role')
    .eq('id', userResult.user.id)
    .maybeSingle();
  if (profileError || !callerProfile) return json({ error: 'Profile not found' }, 403);

  const body = await request.json().catch(() => ({}));
  if (body.action === 'public-key') return json({ publicKey: vapidPublicKey });
  if (body.action !== 'send' || !body.notificationId) return json({ error: 'Invalid request' }, 400);
  if (!['super_admin', 'admin', 'staff'].includes(callerProfile.role)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const { data: notification, error: notificationError } = await admin
    .from('notifications')
    .select('id, school_id, audience, title, body')
    .eq('id', body.notificationId)
    .eq('school_id', callerProfile.school_id)
    .maybeSingle();
  if (notificationError || !notification) return json({ error: 'Notification not found' }, 404);

  await admin.from('notifications').update({ status: 'queued' }).eq('id', notification.id);

  let recipientIds: string[] = [];
  if (notification.audience.endsWith(' velileri') && notification.audience !== 'Tüm veliler') {
    const groupName = notification.audience.slice(0, -' velileri'.length);
    const { data: group } = await admin
      .from('training_groups')
      .select('id')
      .eq('school_id', notification.school_id)
      .eq('name', groupName)
      .maybeSingle();
    if (group) {
      const { data: students } = await admin
        .from('students')
        .select('guardian_user_id')
        .eq('school_id', notification.school_id)
        .eq('group_id', group.id)
        .not('guardian_user_id', 'is', null);
      recipientIds = (students || []).map(row => row.guardian_user_id);
    }
  } else {
    let profilesQuery = admin
      .from('profiles')
      .select('id')
      .eq('school_id', notification.school_id);
    if (notification.audience === 'Tüm veliler') profilesQuery = profilesQuery.eq('role', 'parent');
    if (notification.audience === 'Normal kullanıcılar') profilesQuery = profilesQuery.eq('role', 'staff');
    const { data: profiles } = await profilesQuery;
    recipientIds = (profiles || []).map(profile => profile.id);
  }

  recipientIds = [...new Set(recipientIds.filter(Boolean))];
  let subscriptions: Array<{ id: number; endpoint: string; p256dh: string; auth_secret: string }> = [];
  if (recipientIds.length) {
    const { data } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_secret')
      .in('user_id', recipientIds);
    subscriptions = data || [];
  }

  webpush.setVapidDetails('mailto:00vetmaster00@gmail.com', vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    tag: `sasa-f-${notification.id}`,
    url: 'https://vetmaster.github.io/sporx-futbol-okulu/?open=notifications'
  });

  const results = await Promise.allSettled(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret }
      }, payload, { TTL: 3600, urgency: 'normal', topic: `sasa-f-${notification.id}` });
      return { id: subscription.id, sent: true };
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id);
      }
      throw error;
    }
  }));

  const sent = results.filter(result => result.status === 'fulfilled').length;
  const failed = results.length - sent;
  await admin.from('notifications').update({
    status: sent > 0 ? 'sent' : 'failed',
    sent_at: new Date().toISOString()
  }).eq('id', notification.id);

  return json({ sent, failed, recipients: recipientIds.length });
});
