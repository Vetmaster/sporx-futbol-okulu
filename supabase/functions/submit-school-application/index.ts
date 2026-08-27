import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function clean(value: unknown, maxLength: number) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return response({ error: 'Başvuru hizmeti yapılandırılmamış.' }, 503);

  const body = await request.json().catch(() => ({}));
  const schoolName = clean(body.schoolName, 120);
  const city = clean(body.city, 80);
  const district = clean(body.district, 80);
  const applicantName = clean(body.applicantName, 120);
  const phone = clean(body.phone, 30);
  const email = clean(body.email, 254).toLocaleLowerCase('en-US');
  const note = clean(body.note, 1200) || null;
  if (!schoolName || !city || !district || !applicantName || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: 'Lütfen zorunlu alanları ve e-posta adresini kontrol edin.' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from('school_applications').insert({
    school_name: schoolName, city, district, applicant_name: applicantName, phone, email, note
  }).select('id, created_at').single();
  if (error) {
    if (error.code === '23505') return response({ error: 'Bu e-posta adresi için incelemede olan bir başvuru zaten bulunuyor.' }, 409);
    console.error('submit-school-application failed', error);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  return response({ id: data.id, createdAt: data.created_at, status: 'PENDING' }, 201);
});
