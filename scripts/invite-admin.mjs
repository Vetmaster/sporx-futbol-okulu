import { execFileSync } from 'node:child_process';

const [email, fullName = 'Sasa Futbol Yöneticisi'] = process.argv.slice(2);
const projectRef = 'tezeflsiljqprrqbsypl';
const redirectTo = 'https://vetmaster.github.io/sporx-futbol-okulu/';

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Geçerli bir admin e-posta adresi gereklidir.');
}

const apiKeys = JSON.parse(execFileSync(
  'supabase',
  ['projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'],
  { encoding: 'utf8', maxBuffer: 1024 * 1024 }
));
const serviceRoleKey = apiKeys.find(key => key.name === 'service_role')?.api_key;

if (!serviceRoleKey) throw new Error('Supabase service_role anahtarı bulunamadı.');

const baseUrl = `https://${projectRef}.supabase.co`;
const adminHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json'
};

const inviteResponse = await fetch(
  `${baseUrl}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`,
  {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      email,
      data: { full_name: fullName, requested_role: 'admin' }
    })
  }
);
const inviteResult = await inviteResponse.json();

if (!inviteResponse.ok) {
  throw new Error(`Admin daveti gönderilemedi: ${inviteResult.message || inviteResponse.status}`);
}

const schoolResponse = await fetch(
  `${baseUrl}/rest/v1/schools?slug=eq.sasa-futbol&select=id&limit=1`,
  { headers: adminHeaders }
);
const schools = await schoolResponse.json();

if (!schoolResponse.ok || !schools[0]?.id) {
  throw new Error('Sasa Futbol okul kaydı bulunamadı.');
}

const profileResponse = await fetch(
  `${baseUrl}/rest/v1/profiles?on_conflict=id`,
  {
    method: 'POST',
    headers: {
      ...adminHeaders,
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify({
      id: inviteResult.id,
      school_id: schools[0].id,
      full_name: fullName,
      role: 'admin'
    })
  }
);
const profileResult = await profileResponse.json();

if (!profileResponse.ok) {
  throw new Error(`Admin profili oluşturulamadı: ${profileResult.message || profileResponse.status}`);
}

console.log(JSON.stringify({
  invited: true,
  email: inviteResult.email,
  userId: inviteResult.id,
  role: profileResult[0]?.role,
  redirectTo
}));

