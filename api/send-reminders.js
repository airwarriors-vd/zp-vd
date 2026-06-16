import webpush from 'web-push';

const KYIV_TZ='Europe/Kyiv';
const dayMap=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function kyivParts(d=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:KYIV_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'long',hour12:false}).formatToParts(d).map(p=>[p.type,p.value]));
  const weekdayName=String(parts.weekday||'').toLowerCase();
  const weekdayMap={sunday:'sunday',monday:'monday',tuesday:'tuesday',wednesday:'wednesday',thursday:'thursday',friday:'friday',saturday:'saturday'};
  return {date:`${parts.year}-${parts.month}-${parts.day}`,month:parts.month,day:parts.day,hour:Number(parts.hour),minute:Number(parts.minute),weekday:weekdayMap[weekdayName]||dayMap[d.getUTCDay()]};
}
function timeDue(reminderTime, now){
  const [h,m]=String(reminderTime||'18:00').split(':').map(Number);
  if(Number.isNaN(h)) return false;
  const minsNow=now.hour*60+now.minute;
  const minsSet=h*60+(Number.isNaN(m)?0:m);
  return minsNow>=minsSet && minsNow<minsSet+30;
}
function isReminderDue(u, now, force=false){
  if(force) return true;
  if(u.reminder_enabled===false) return false;
  if(!timeDue(u.reminder_time, now)) return false;
  const freq=u.reminder_frequency||'weekly';
  if(freq==='daily') return true;
  if(freq==='monthly') return now.day==='01';
  return (u.reminder_day||'friday')===now.weekday;
}
async function supabaseFetch(path, opts={}){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Missing Supabase env');
  const r=await fetch(`${url}${path}`,{...opts,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(opts.headers||{})}});
  const text=await r.text();
  let data; try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok) throw new Error(typeof data==='string'?data:(data.message||data.error||JSON.stringify(data)));
  return data;
}
async function sendOne(sub,payload){
  return webpush.sendNotification(sub,JSON.stringify(payload));
}
export default async function handler(req,res){
  try{
    const publicKey=process.env.VAPID_PUBLIC_KEY;
    const privateKey=process.env.VAPID_PRIVATE_KEY;
    const subject=process.env.VAPID_SUBJECT||'mailto:admin@example.com';
    if(!publicKey||!privateKey) return res.status(500).json({error:'Missing VAPID keys'});
    webpush.setVapidDetails(subject,publicKey,privateKey);
    const now=kyivParts();
    const forceTest=String(req.url||'').includes('test=1');
    const forceBirthday=String(req.url||'').includes('birthday=1');
    const users=await supabaseFetch('/rest/v1/users?select=id,full_name,callsign,status,employee_status,birth_date,reminder_enabled,reminder_frequency,reminder_day,reminder_time&order=full_name.asc');
    const subs=await supabaseFetch('/rest/v1/push_subscriptions?select=user_id,subscription,endpoint');
    const active=(users||[]).filter(u=>(u.status||u.employee_status)!=='dismissed');
    const subsByUser={};
    (subs||[]).forEach(s=>{(subsByUser[s.user_id] ||= []).push(s)});
    let sent=0, skipped=0, failed=0;
    async function sendToUser(userId,payload){
      const list=subsByUser[userId]||[];
      if(!list.length){skipped++;return;}
      for(const s of list){
        try{await sendOne(s.subscription,payload); sent++;}catch(e){failed++;}
      }
    }
    if(forceTest){
      for(const u of active) await sendToUser(u.id,{title:'ЗП-VD',body:'Тестове push-повідомлення працює ✅',url:'/'});
      return res.status(200).json({ok:true,type:'test',sent,skipped,failed});
    }
    for(const u of active){
      if(isReminderDue(u,now,false)){
        await sendToUser(u.id,{title:'ЗП-VD: нагадування',body:'Не забудьте внести робочі дні у звіт.',url:'/'});
      }
    }
    const birthdayPeople=active.filter(u=>u.birth_date && String(u.birth_date).slice(5,10)===`${now.month}-${now.day}`);
    const birthdayWindow=(now.hour===9 && now.minute<30) || forceBirthday;
    if(birthdayPeople.length && birthdayWindow){
      const names=birthdayPeople.map(u=>`${u.full_name||''}${u.callsign?' ('+u.callsign+')':''}`.trim()).join(', ');
      for(const u of active){
        await sendToUser(u.id,{title:'🎉 День народження',body:`Сьогодні день народження: ${names}. Не забудьте привітати!`,url:'/'});
      }
    }
    return res.status(200).json({ok:true,sent,skipped,failed,birthdays:birthdayPeople.length,date:now.date,time:`${now.hour}:${String(now.minute).padStart(2,'0')}`});
  }catch(e){return res.status(500).json({ok:false,error:e.message||'Unknown error'});}
}
