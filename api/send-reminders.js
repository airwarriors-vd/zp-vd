import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

function kyivNowParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);
  const get = t => parts.find(p => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    md: `${get('month')}-${get('day')}`,
    weekday: (get('weekday') || '').toLowerCase(),
    hm: `${get('hour')}:${get('minute')}`
  };
}

function addCalendarDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function md(dateStr) {
  return String(dateStr).slice(5, 10);
}

function employeeName(u) {
  return `${u.full_name || ''}${u.callsign ? ' (' + u.callsign + ')' : ''}`.trim();
}

async function sf(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Supabase env variables missing');
  const resp = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...(options.headers || {})
    }
  });
  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!resp.ok) {
    const msg = data?.message || data?.msg || data?.error || text || `HTTP ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function tryCreateNotificationLog(eventKey, eventType, targetUserId, notifyDate, details = {}) {
  try {
    await sf('/rest/v1/notification_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_key: eventKey,
        event_type: eventType,
        target_user_id: targetUserId || null,
        notify_date: notifyDate,
        details
      })
    });
    return true;
  } catch (e) {
    // 23505 / 409 = already sent for this day/event; skip duplicate cron runs.
    if (e.status === 409 || String(e.message || '').includes('duplicate key')) return false;
    throw e;
  }
}

async function sendToSubscriptions(subs, payload) {
  let sent = 0, failed = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify(payload));
      sent++;
    } catch (e) {
      failed++;
      if ([404, 410].includes(e.statusCode)) {
        try { await sf(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }); } catch {}
      }
    }
  }
  return { sent, failed };
}

export default async function handler(req, res) {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID keys missing');
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const now = kyivNowParts();
    const tomorrowDate = addCalendarDays(now.date, 1);
    const tomorrowMd = md(tomorrowDate);

    const users = await sf('/rest/v1/users?select=id,full_name,callsign,birth_date,status,employee_status,reminder_enabled,reminder_frequency,reminder_day,reminder_time&or=(status.is.null,status.neq.dismissed)');
    const activeUsers = (users || []).filter(u => (u.status || u.employee_status) !== 'dismissed');
    const subs = await sf('/rest/v1/push_subscriptions?select=id,user_id,subscription');
    const allSubs = subs || [];

    let sent = 0, failed = 0, skipped = 0;
    let birthdayToday = 0, birthdayTomorrow = 0;

    // 1) Нагадування за день до дня народження.
    const tomorrowBirthdays = activeUsers.filter(u => u.birth_date && String(u.birth_date).slice(5, 10) === tomorrowMd);
    for (const b of tomorrowBirthdays) {
      const ok = await tryCreateNotificationLog(
        `birthday-before:${now.date}:${b.id}`,
        'birthday_before',
        b.id,
        now.date,
        { employee: employeeName(b), birth_date: b.birth_date, birthday_date: tomorrowDate }
      );
      if (!ok) { skipped++; continue; }
      const r = await sendToSubscriptions(allSubs, {
        title: '🎂 Завтра день народження',
        body: `Завтра день народження: ${employeeName(b)}. Не забудьте привітати!`,
        url: '/'
      });
      sent += r.sent;
      failed += r.failed;
      birthdayTomorrow++;
    }

    // 2) Повтор у сам день народження.
    const todayBirthdays = activeUsers.filter(u => u.birth_date && String(u.birth_date).slice(5, 10) === now.md);
    for (const b of todayBirthdays) {
      const ok = await tryCreateNotificationLog(
        `birthday-day:${now.date}:${b.id}`,
        'birthday_day',
        b.id,
        now.date,
        { employee: employeeName(b), birth_date: b.birth_date, birthday_date: now.date }
      );
      if (!ok) { skipped++; continue; }
      const r = await sendToSubscriptions(allSubs, {
        title: '🎂 День народження',
        body: `Сьогодні день народження: ${employeeName(b)}. Не забудьте привітати!`,
        url: '/'
      });
      sent += r.sent;
      failed += r.failed;
      birthdayToday++;
    }

    // 3) Звичайні нагадування працівникам за їхніми налаштуваннями.
    const dayMap = {
      monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday', thursday: 'thursday',
      friday: 'friday', saturday: 'saturday', sunday: 'sunday'
    };

    for (const u of activeUsers) {
      if (u.reminder_enabled === false) { skipped++; continue; }
      const freq = u.reminder_frequency || 'weekly';
      const remTime = (u.reminder_time || '18:00').slice(0, 5);
      const remDay = (u.reminder_day || 'friday').toLowerCase();
      let due = false;

      if (freq === 'daily') due = now.hm === remTime;
      else if (freq === 'weekly') due = now.hm === remTime && dayMap[remDay] === now.weekday;
      else if (freq === 'monthly') due = now.hm === remTime && now.date.endsWith('-01');

      if (!due) { skipped++; continue; }

      // Захист від повторної відправки звичайного нагадування, якщо cron викличеться кілька разів у ту саму хвилину.
      const ok = await tryCreateNotificationLog(
        `work-reminder:${now.date}:${now.hm}:${u.id}`,
        'work_reminder',
        u.id,
        now.date,
        { frequency: freq, time: remTime, day: remDay }
      );
      if (!ok) { skipped++; continue; }

      const userSubs = allSubs.filter(s => s.user_id === u.id);
      if (!userSubs.length) { skipped++; continue; }
      const r = await sendToSubscriptions(userSubs, {
        title: 'ЗП-VD',
        body: 'Не забудьте подати робочі дні / перевірити звіт.',
        url: '/'
      });
      sent += r.sent;
      failed += r.failed;
    }

    return res.status(200).json({
      ok: true,
      sent,
      skipped,
      failed,
      birthday_today: birthdayToday,
      birthday_tomorrow: birthdayTomorrow,
      date: now.date,
      time: now.hm
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Unknown error' });
  }
}
