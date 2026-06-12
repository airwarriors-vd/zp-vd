export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server env variables are missing' });
  }

  try {
    const body = req.body || {};
    const {
      full_name,
      callsign,
      email,
      password,
      phone,
      birth_date,
      employment_type,
      status,
      role,
      leader_direction
    } = body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'ПІБ, email і пароль обовʼязкові' });
    }

    // 1) Create Auth user
    const authResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, callsign }
      })
    });

    const authJson = await authResp.json();
    if (!authResp.ok) {
      return res.status(authResp.status).json({ error: authJson.msg || authJson.message || JSON.stringify(authJson) });
    }

    const authId = authJson.id;

    // 2) Create profile row
    const profile = {
      full_name,
      callsign: callsign || null,
      email,
      phone: phone || null,
      birth_date: birth_date || null,
      employment_type: employment_type || 'freelancer',
      role: role || 'user',
      leader_direction: leader_direction || null,
      status: status || 'active',
      employee_status: status || 'active',
      auth_id: authId,
      auth_user_id: authId
    };

    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(profile)
    });

    const insertText = await insertResp.text();
    let insertJson;
    try { insertJson = JSON.parse(insertText); } catch { insertJson = insertText; }

    if (!insertResp.ok) {
      // rollback Auth user if profile creation failed
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authId}`, {
        method: 'DELETE',
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
        }
      });
      return res.status(insertResp.status).json({ error: insertJson.message || insertJson.msg || JSON.stringify(insertJson) });
    }

    return res.status(200).json({ ok: true, auth_id: authId, profile: insertJson?.[0] || null });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Unknown server error' });
  }
}
