import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Missing env variables' });
  try {
    const { user_id, subscription } = req.body || {};
    if (!user_id || !subscription?.endpoint) return res.status(400).json({ error: 'user_id and subscription required' });
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id,
      endpoint: subscription.endpoint,
      subscription
    }, { onConflict: 'endpoint' });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
