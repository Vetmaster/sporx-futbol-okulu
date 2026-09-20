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

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
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
  const address = clean(body.address, 500);
  const applicantName = clean(body.applicantName, 120);
  const phone = formatNationalPhone(body.phone);
  const email = clean(body.email, 254).toLocaleLowerCase('en-US');
  const note = clean(body.note, 1200) || null;
  if (!['Türkiye', 'KKTC'].includes(country) || !schoolName || !city || (country === 'Türkiye' && !district) || address.length < 5 || !applicantName || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: 'Lütfen zorunlu alanları ve e-posta adresini kontrol edin.' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: existingApplication, error: existingError } = await admin
    .from('school_applications')
    .select('id, status')
    .eq('email', email)
    .maybeSingle();
  if (existingError) {
    console.error('submit-school-application duplicate check failed', existingError);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  if (existingApplication) {
    if (['PENDING', 'INFO_REQUESTED'].includes(existingApplication.status)) {
      return response({ status: 'PENDING_REVIEW', duplicate: true, message: 'Başvurunuz henüz onay aşamasında. İnceleme tamamlandığında e-posta adresiniz üzerinden bilgilendirileceksiniz.' }, 202);
    }
    if (existingApplication.status === 'APPROVED') {
      return response({ status: 'REGISTERED_SCHOOL', duplicate: true, message: 'Bu e-posta adresiyle kayıtlı bir futbol okulu vardır. Lütfen farklı bir e-posta adresiyle başvuru yapın.' }, 202);
    }
    return response({ status: 'IGNORED', duplicate: true }, 202);
  }

  const normalizedSchoolName = normalizeSearchText(schoolName);
  const { data: existingNameApplication, error: existingNameApplicationError } = await admin
    .from('school_applications')
    .select('id, status')
    .ilike('school_name', normalizedSchoolName)
    .limit(1)
    .maybeSingle();
  if (existingNameApplicationError) {
    console.error('submit-school-application school name duplicate check failed', existingNameApplicationError);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  if (existingNameApplication) {
    return response({ status: 'REGISTERED_SCHOOL_NAME', duplicate: true, message: 'Bu isimle kayıtlı bir futbol okulu bulunmaktadır. Lütfen okul adını kontrol edin veya farklı bir okul adıyla başvuru yapın.' }, 202);
  }

  const { data: existingSchool, error: existingSchoolError } = await admin
    .from('schools')
    .select('id')
    .ilike('name', normalizedSchoolName)
    .limit(1)
    .maybeSingle();
  if (existingSchoolError) {
    console.error('submit-school-application school duplicate check failed', existingSchoolError);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  if (existingSchool) {
    return response({ status: 'REGISTERED_SCHOOL_NAME', duplicate: true, message: 'Bu isimle kayıtlı bir futbol okulu bulunmaktadır. Lütfen okul adını kontrol edin veya farklı bir okul adıyla başvuru yapın.' }, 202);
  }

  const { data, error } = await admin.from('school_applications').insert({
    school_name: schoolName, country, city, district: district || null, address, applicant_name: applicantName, phone, email, note
  }).select('id, created_at').single();
  if (error) {
    if (error.code === '23505') return response({ status: 'IGNORED', duplicate: true }, 202);
    console.error('submit-school-application failed', error);
    return response({ error: 'Başvuru şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, 500);
  }
  return response({ id: data.id, createdAt: data.created_at, status: 'PENDING' }, 201);
});
