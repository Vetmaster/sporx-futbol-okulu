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

function formatNationalPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^0\d{10}$/.test(digits)) return '';
  return `0 (${digits.slice(1, 4)}) ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return response({ error: 'Başvuru hizmeti yapılandırılmamış.' }, 503);

  const body = await request.json().catch(() => ({}));
  const schoolName = clean(body.schoolName, 120);
  const country = clean(body.country, 20);
  const city = clean(body.city, 80);
  const district = clean(body.district, 80);
  const applicantName = clean(body.applicantName, 120);
  const phone = formatNationalPhone(body.phone);
  const email = clean(body.email, 254).toLocaleLowerCase('en-US');
  const note = clean(body.note, 1200) || null;
  if (!['Türkiye', 'KKTC'].includes(country) || !schoolName || !city || (country === 'Türkiye' && !district) || !applicantName || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: 'Lütfen zorunlu alanları ve e-posta adresini kontrol edin.' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from('school_applications').insert({
    school_name: schoolName, country, city, district: district || null, applicant_name: applicantName, phone, email, note
  }).select('id, created_at').single();
  if (error) {
    if (error.code === '23505') return response({ error: 'Bu e-posta adresi için incelemede olan bir başvuru zaten bulunuyor.' }, 409);
    console.error('submit-school-application failed', error);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  return response({ id: data.id, createdAt: data.created_at, status: 'PENDING' }, 201);
});
