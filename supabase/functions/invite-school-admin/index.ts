import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const inviteRedirectUrl = 'https://vetmaster.github.io/sporx-futbol-okulu/';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function normalizedEmail(value: unknown) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(user => normalizedEmail(user.email) === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  throw new Error('Kullanıcı listesi güvenli biçimde taranamadı.');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Davet hizmeti yapılandırılmamış.' }, 503);

  const authorization = request.headers.get('Authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Oturum doğrulanamadı.' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: callerResult, error: callerError } = await admin.auth.getUser(accessToken);
  if (callerError || !callerResult.user) return json({ error: 'Oturum doğrulanamadı.' }, 401);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerResult.user.id)
    .maybeSingle();
  if (callerProfile?.role !== 'super_admin') return json({ error: 'Süper Admin yetkisi gereklidir.' }, 403);

  const body = await request.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '');
  const email = normalizedEmail(body.email);
  const fullName = String(body.fullName || '').trim();
  const role = String(body.role || 'admin');
  if (!schoolId || !fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin', 'coach'].includes(role)) {
    return json({ error: 'Kullanıcı adı, e-posta adresi ve rolü kontrol edin.' }, 400);
  }

  const { data: school } = await admin
    .from('schools')
    .select('id, name, is_active')
    .eq('id', schoolId)
    .maybeSingle();
  if (!school) return json({ error: 'Okul bulunamadı.' }, 404);
  if (school.is_active === false) return json({ error: 'Pasif okula kullanıcı daveti gönderilemez.' }, 409);

  let invitedUser;
  try {
    invitedUser = await findUserByEmail(admin, email);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Kullanıcı kontrol edilemedi.' }, 500);
  }

  let invited = false;
  if (!invitedUser) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirectUrl,
      data: { full_name: fullName, role, school_id: schoolId, access_request: false }
    });
    if (error || !data.user) return json({ error: error?.message || 'Kullanıcı daveti gönderilemedi.' }, 502);
    invitedUser = data.user;
    invited = true;
  }

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('school_id, role')
    .eq('id', invitedUser.id)
    .maybeSingle();
  if (existingProfile && (existingProfile.school_id !== schoolId || existingProfile.role === 'super_admin')) {
    return json({ error: 'Bu e-posta adresi başka bir okula veya Süper Admin hesabına ait.' }, 409);
  }

  if (role !== 'parent') {
    const { error: unlinkError } = await admin
      .from('students')
      .update({ guardian_user_id: null })
      .eq('school_id', schoolId)
      .eq('guardian_user_id', invitedUser.id);
    if (unlinkError) return json({ error: 'Eski veli bağlantıları kaldırılamadı.' }, 500);
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: invitedUser.id,
    school_id: schoolId,
    full_name: fullName,
    role
  }, { onConflict: 'id' });
  if (profileError) return json({ error: 'Kullanıcı profili oluşturulamadı.' }, 500);

  const { error: requestError } = await admin.from('access_requests').upsert({
    user_id: invitedUser.id,
    school_id: schoolId,
    email,
    full_name: fullName,
    requested_role: role,
    status: 'approved',
    email_verified_at: invitedUser.email_confirmed_at,
    reviewed_by: callerResult.user.id,
    reviewed_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  if (requestError) return json({ error: 'Admin erişim kaydı oluşturulamadı.' }, 500);

  return json({
    status: invited ? 'invited' : 'linked',
    schoolId,
    schoolName: school.name,
    email,
    role,
    userId: invitedUser.id
  });
});
