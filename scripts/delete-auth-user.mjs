import { execFileSync } from 'node:child_process';

const [email] = process.argv.slice(2);
const projectRef = 'tezeflsiljqprrqbsypl';

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Geçerli bir kullanıcı e-posta adresi gereklidir.');
}

const apiKeys = JSON.parse(execFileSync(
  'supabase',
  ['projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'],
  { encoding: 'utf8', maxBuffer: 1024 * 1024 }
));
const serviceRoleKey = apiKeys.find(key => key.name === 'service_role')?.api_key;

if (!serviceRoleKey) throw new Error('Supabase service_role anahtarı bulunamadı.');

const baseUrl = `https://${projectRef}.supabase.co`;
const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json'
};
const listResponse = await fetch(`${baseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers });
const listResult = await listResponse.json();

if (!listResponse.ok) {
  throw new Error(`Kullanıcı listesi alınamadı: ${listResult.message || listResponse.status}`);
}

const user = listResult.users?.find(item => item.email?.toLocaleLowerCase('tr-TR') === email.toLocaleLowerCase('tr-TR'));
if (!user) {
  console.log(JSON.stringify({ deleted: false, email, reason: 'not_found' }));
  process.exit(0);
}

const deleteResponse = await fetch(`${baseUrl}/auth/v1/admin/users/${user.id}`, {
  method: 'DELETE',
  headers
});

if (!deleteResponse.ok) {
  const deleteResult = await deleteResponse.json();
  throw new Error(`Kullanıcı silinemedi: ${deleteResult.message || deleteResponse.status}`);
}

console.log(JSON.stringify({ deleted: true, email, userId: user.id }));

