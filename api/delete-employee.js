import { readJson, verifyAdmin, supaFetch } from './_admin.js';

async function del(table, query) {
  try { await supaFetch(`/rest/v1/${table}?${query}`, { method: 'DELETE' }); } catch (e) { /* ignore missing tables/policies under service role */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { profile } = await verifyAdmin(req);
    const { user_id } = await readJson(req);
    if (!user_id) return res.status(400).json({ error: 'user_id обовʼязковий' });
    if (user_id === profile.id) return res.status(400).json({ error: 'Не можна видалити власний профіль' });

    const rows = await supaFetch(`/rest/v1/users?select=*&id=eq.${user_id}`);
    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user) return res.status(404).json({ error: 'Працівника не знайдено' });

    await del('work_days', `user_id=eq.${user_id}`);
    await del('adjustments', `user_id=eq.${user_id}`);
    await del('salary_rates_history', `user_id=eq.${user_id}`);
    await del('month_locks', `user_id=eq.${user_id}`);
    await del('push_subscriptions', `user_id=eq.${user_id}`);
    await del('payslip_confirmations', `user_id=eq.${user_id}`);

    await supaFetch(`/rest/v1/users?id=eq.${user_id}`, { method: 'DELETE' });

    const authId = user.auth_id || user.auth_user_id;
    if (authId) {
      try { await supaFetch(`/auth/v1/admin/users/${authId}`, { method: 'DELETE' }); } catch (e) {}
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Unknown server error' });
  }
}
