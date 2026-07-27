import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const PUSH_TIMEOUT_MS = 12000;

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

  const body = await request.json().catch(() => ({}));
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  if (body.action === 'public-key') {
    return vapidPublicKey
      ? json({ publicKey: vapidPublicKey })
      : json({ error: 'Push service is not configured' }, 503);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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

  if (!['super_admin', 'admin', 'staff'].includes(callerProfile.role)) {
    return json({ error: 'Forbidden' }, 403);
  }

  let notificationId = Number(body.notificationId || 0);
  let trainingId: number | null = null;
  if (body.action === 'create-training-and-send') {
    const training = body.training || {};
    const groupName = String(training.group || '').trim();
    const trainingDate = String(training.date || '').trim();
    const startTime = String(training.time || '').trim();
    const duration = Number(training.duration || 0);
    const title = String(training.title || '').trim();
    const coach = String(training.coach || '').trim();
    const field = String(training.field || '').trim();
    if (!groupName || !trainingDate || !startTime || !duration || !title || !coach || !field) {
      return json({ error: 'Invalid training' }, 400);
    }

    const { data: group, error: groupError } = await admin
      .from('training_groups')
      .select('id, name')
      .eq('school_id', callerProfile.school_id)
      .eq('name', groupName)
      .maybeSingle();
    if (groupError || !group) return json({ error: 'Training group not found' }, 404);

    const { data: createdTraining, error: trainingError } = await admin
      .from('trainings')
      .insert({
        school_id: callerProfile.school_id,
        group_id: group.id,
        training_date: trainingDate,
        start_time: startTime,
        duration_minutes: duration,
        title,
        coach,
        field
      })
      .select('id')
      .single();
    if (trainingError || !createdTraining) {
      return json({ error: trainingError?.message || 'Training could not be created' }, 500);
    }
    trainingId = Number(createdTraining.id);

    const formattedDate = new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Istanbul'
    }).format(new Date(`${trainingDate}T12:00:00+03:00`));
    const { data: createdNotification, error: createError } = await admin
      .from('notifications')
      .insert({
        school_id: callerProfile.school_id,
        audience: `${group.name} velileri`,
        title: `${group.name} grubu · Yeni antrenman`,
        body: `${formattedDate} saat ${startTime.slice(0, 5)}’de ${title} antrenmanı yapılacaktır. Süre: ${duration} dakika. Saha: ${field}. Antrenör: ${coach}.`,
        status: 'queued',
        sent_by: userResult.user.id
      })
      .select('id')
      .single();
    if (createError || !createdNotification) {
      await admin.from('trainings').delete().eq('id', trainingId);
      return json({ error: createError?.message || 'Notification could not be created' }, 500);
    }
    notificationId = Number(createdNotification.id);
  } else if (body.action === 'create-and-send') {
    const audience = String(body.notification?.audience || '').trim();
    const title = String(body.notification?.title || '').trim();
    const notificationBody = String(body.notification?.body || '').trim();
    if (!audience || !title || !notificationBody) return json({ error: 'Invalid notification' }, 400);

    const { data: createdNotification, error: createError } = await admin
      .from('notifications')
      .insert({
        school_id: callerProfile.school_id,
        audience,
        title,
        body: notificationBody,
        status: 'queued',
        sent_by: userResult.user.id
      })
      .select('id')
      .single();
    if (createError || !createdNotification) {
      return json({ error: createError?.message || 'Notification could not be created' }, 500);
    }
    notificationId = Number(createdNotification.id);
  } else if (body.action !== 'send' || !notificationId) {
    return json({ error: 'Invalid request' }, 400);
  }

  const { data: notification, error: notificationError } = await admin
    .from('notifications')
    .select('id, school_id, audience, title, body')
    .eq('id', notificationId)
    .eq('school_id', callerProfile.school_id)
    .maybeSingle();
  if (notificationError || !notification) return json({ error: 'Notification not found' }, 404);

  await admin.from('notifications').update({ status: 'queued' }).eq('id', notification.id);

  let recipientIds: string[] = [];
  if (['Aidat borcu olanlar', 'Aidat borcu olmayanlar'].includes(notification.audience)) {
    const { data: students, error: studentsError } = await admin
      .from('students')
      .select('id, guardian_user_id')
      .eq('school_id', notification.school_id)
      .not('guardian_user_id', 'is', null);
    if (studentsError) return json({ error: 'Students could not be loaded' }, 500);

    const studentIds = (students || []).map(student => student.id);
    const { data: unpaidFees, error: feeError } = studentIds.length
      ? await admin
        .from('fee_periods')
        .select('student_id')
        .eq('school_id', notification.school_id)
        .eq('status', 'late')
        .in('student_id', studentIds)
      : { data: [], error: null };
    if (feeError) return json({ error: 'Fee periods could not be loaded' }, 500);

    const debtorStudentIds = new Set((unpaidFees || []).map(fee => Number(fee.student_id)));
    const allGuardianIds = new Set((students || []).map(student => student.guardian_user_id));
    const debtorGuardianIds = new Set(
      (students || [])
        .filter(student => debtorStudentIds.has(Number(student.id)))
        .map(student => student.guardian_user_id)
    );
    recipientIds = notification.audience === 'Aidat borcu olanlar'
      ? [...debtorGuardianIds]
      : [...allGuardianIds].filter(guardianId => !debtorGuardianIds.has(guardianId));
  } else if (notification.audience.endsWith(' velileri') && notification.audience !== 'Tüm veliler') {
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
      await Promise.race([
        webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret }
        }, payload, { TTL: 3600, urgency: 'high', topic: `sasa-f-${notification.id}` }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Push delivery request timed out')), PUSH_TIMEOUT_MS);
        })
      ]);
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

  return json({ trainingId, notificationId: notification.id, sent, failed, recipients: recipientIds.length });
});
