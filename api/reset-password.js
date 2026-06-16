import { requireAdmin, readJson } from './_admin.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const {SUPABASE_URL,SERVICE_ROLE_KEY}=await requireAdmin(req);
    const body=await readJson(req);
    const userId=body.user_id;
    const password=String(body.password||'');
    if(!userId||password.length<6) return res.status(400).json({error:'user_id і пароль мінімум 6 символів обовʼязкові'});
    const uResp=await fetch(`${SUPABASE_URL}/rest/v1/users?select=*&id=eq.${userId}`,{headers:{apikey:SERVICE_ROLE_KEY,Authorization:`Bearer ${SERVICE_ROLE_KEY}`}});
    const users=await uResp.json();
    if(!uResp.ok||!users?.[0]) return res.status(404).json({error:'Працівника не знайдено'});
    const u=users[0];
    const authId=u.auth_id||u.auth_user_id;
    if(!authId) return res.status(400).json({error:'У працівника немає auth_id/auth_user_id'});
    const r=await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authId}`,{
      method:'PUT',
      headers:{'Content-Type':'application/json',apikey:SERVICE_ROLE_KEY,Authorization:`Bearer ${SERVICE_ROLE_KEY}`},
      body:JSON.stringify({password})
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok) return res.status(r.status).json({error:j.msg||j.message||JSON.stringify(j)});
    return res.status(200).json({ok:true});
  }catch(e){return res.status(500).json({error:e.message||'Unknown error'});}
}
