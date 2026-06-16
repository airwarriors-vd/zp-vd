import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

function todayKyivParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year:'numeric', month:'2-digit', day:'2-digit', weekday:'long', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(now);
  const get = t => parts.find(p => p.type === t)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, md: `${get('month')}-${get('day')}`, weekday: (get('weekday')||'').toLowerCase(), hm: `${get('hour')}:${get('minute')}` };
}
async function sf(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Supabase env variables missing');
  const resp = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...(options.headers||{}) }
  });
  const text = await resp.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!resp.ok) throw new Error(data?.message || data?.msg || data?.error || text || `HTTP ${resp.status}`);
  return data;
}
async function sendToSubscriptions(subs, payload) {
  let sent = 0, failed = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify(payload));
      sent++;
    } catch (e) {
      failed++;
      if ([404,410].includes(e.statusCode)) {
        try { await sf(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method:'DELETE' }); } catch {}
      }
    }
  }
  return { sent, failed };
}

export default async function handler(req, res) {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID keys missing');
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const now = todayKyivParts();
    const users = await sf('/rest/v1/users?select=id,full_name,callsign,birth_date,status,employee_status,reminder_enabled,reminder_frequency,reminder_day,reminder_time&or=(status.is.null,status.neq.dismissed)');
    const subs = await sf('/rest/v1/push_subscriptions?select=id,user_id,subscription');

    let sent = 0, failed = 0, skipped = 0;

    const birthdays = (users||[]).filter(u => u.birth_date && String(u.birth_date).slice(5,10) === now.md);
    for (const b of birthdays) {
      const allSubs = subs || [];
      const r = await sendToSubscriptions(allSubs, {
        title: '🎂 День народження',
        body: `Сьогодні день народження: ${b.full_name || ''}${b.callsign ? ' (' + b.callsign + ')' : ''}. Не забудьте привітати!`,
        url: '/'
      });
      sent += r.sent; failed += r.failed;
      try { await sf('/rest/v1/audit_log', { method:'POST', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body:JSON.stringify({ action:'birthday_push', details:{ user_id:b.id, full_name:b.full_name, callsign:b.callsign, date:now.date } }) }); } catch {}
    }

    const dayMap = { monday:'monday', tuesday:'tuesday', wednesday:'wednesday', thursday:'thursday', friday:'friday', saturday:'saturday', sunday:'sunday' };
    for (const u of users || []) {
      if (u.reminder_enabled === false) { skipped++; continue; }
      const freq = u.reminder_frequency || 'weekly';
      const remTime = (u.reminder_time || '18:00').slice(0,5);
      const remDay = (u.reminder_day || 'friday').toLowerCase();
      let due = false;
      if (freq === 'daily') due = now.hm === remTime;
      else if (freq === 'weekly') due = now.hm === remTime && dayMap[remDay] === now.weekday;
      else if (freq === 'monthly') due = now.hm === remTime && now.date.endsWith('-01');
      if (!due) { skipped++; continue; }
      const userSubs = (subs||[]).filter(s=>s.user_id===u.id);
      if (!userSubs.length) { skipped++; continue; }
      const r = await sendToSubscriptions(userSubs, { title:'ЗП-VD', body:'Не забудьте подати робочі дні / перевірити звіт.', url:'/' });
      sent += r.sent; failed += r.failed;
    }

    return res.status(200).json({ ok:true, sent, skipped, failed, birthdays: birthdays.length });
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message || 'Unknown error' });
  }
}
