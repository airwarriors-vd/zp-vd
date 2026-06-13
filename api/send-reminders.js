import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function monthStart(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function dateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function weekStart(d) { const x = new Date(d); const day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); return dateStr(x); }
function weekEnd(d) { const x = new Date(d); const day = (x.getDay()+6)%7; x.setDate(x.getDate()+(6-day)); return dateStr(x); }
function dueForUser(user, now) {
  if (user.reminder_enabled === false) return false;
  const freq = user.reminder_frequency || 'weekly';
  const day = user.reminder_day || 'friday';
  if (freq === 'daily') return true;
  if (freq === 'weekly') return dayMap[now.getDay()] === day;
  if (freq === 'monthly') return now.getDate() === 1;
  return false;
}

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Missing env variables' });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const { data: users, error: uErr } = await supabase.from('users').select('*').neq('status', 'dismissed');
  if (uErr) return res.status(500).json({ error: uErr.message });
  let sent = 0, skipped = 0, failed = 0;
  for (const user of users || []) {
    if (!dueForUser(user, now)) { skipped++; continue; }
    const freq = user.reminder_frequency || 'weekly';
    let from = dateStr(now), to = dateStr(now), label = 'сьогодні';
    if (freq === 'weekly') { from = weekStart(now); to = weekEnd(now); label = 'цей тиждень'; }
    if (freq === 'monthly') { from = monthStart(now); to = dateStr(now); label = 'цей місяць'; }
    const { count } = await supabase.from('work_days').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('work_date', from).lte('work_date', to);
    if ((count || 0) > 0) { skipped++; continue; }
    const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', user.id);
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify({
          title: 'ЗП-VD',
          body: `Нагадування: подайте звіт за ${label}.`,
          url: '/'
        }));
        sent++;
      } catch (e) {
        failed++;
        if (e.statusCode === 404 || e.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
  return res.status(200).json({ ok: true, sent, skipped, failed });
}
