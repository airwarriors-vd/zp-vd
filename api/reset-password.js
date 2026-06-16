import { readJson, verifyAdmin, supaFetch } from './_admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await verifyAdmin(req);
    const { user_id, password } = await readJson(req);
    if (!user_id || !password || String(password).length < 6) {
      return res.status(400).json({ error: 'user_id і пароль мінімум 6 символів обовʼязкові' });
    }

    const rows = await supaFetch(`/rest/v1/users?select=id,auth_id,auth_user_id,email&eq=id.${user_id}`);
    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user) return res.status(404).json({ error: 'Працівника не знайдено' });
    const authId = user.auth_id || user.auth_user_id;
    if (!authId) return res.status(400).json({ error: 'У працівника не привʼязаний auth_id' });

    await supaFetch(`/auth/v1/admin/users/${authId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Unknown server error' });
  }
}
