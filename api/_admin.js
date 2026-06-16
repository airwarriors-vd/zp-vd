const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
}

export function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Server env variables are missing');
  return { SUPABASE_URL, SERVICE_ROLE_KEY };
}

async function supaFetch(path, options = {}) {
  const { SUPABASE_URL, SERVICE_ROLE_KEY } = requireEnv();
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...(options.headers || {})
  };
  const resp = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!resp.ok) {
    const msg = data?.message || data?.msg || data?.error || text || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function verifyAdmin(req) {
  const { SUPABASE_URL, SERVICE_ROLE_KEY } = requireEnv();
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing Authorization token');

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` }
  });
  const authUser = await userResp.json().catch(() => null);
  if (!userResp.ok || !authUser?.id) throw new Error('Invalid user token');

  const rows = await supaFetch(`/rest/v1/users?select=id,role,auth_id,auth_user_id,email&or=(auth_id.eq.${authUser.id},auth_user_id.eq.${authUser.id},id.eq.${authUser.id},email.eq.${encodeURIComponent(authUser.email || '')})`, {
    headers: { Accept: 'application/json' }
  });
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.role !== 'admin') throw new Error('Admin only');
  return { authUser, profile };
}

export { supaFetch };
