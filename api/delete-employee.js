import { requireAdmin, readJson } from './_admin.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const {SUPABASE_URL,SERVICE_ROLE_KEY,profile}=await requireAdmin(req);
    const body=await readJson(req);
    const userId=body.user_id;
    if(!userId) return res.status(400).json({error:'user_id обовʼязковий'});
    if(userId===profile.id) return res.status(400).json({error:'Не можна видалити власний профіль'});
    const uResp=await fetch(`${SUPABASE_URL}/rest/v1/users?select=*&id=eq.${userId}`,{headers:{apikey:SERVICE_ROLE_KEY,Authorization:`Bearer ${SERVICE_ROLE_KEY}`}});
    const users=await uResp.json();
    if(!uResp.ok||!users?.[0]) return res.status(404).json({error:'Працівника не знайдено'});
    const u=users[0];
    const authId=u.auth_id||u.auth_user_id;
    let authDeleteStatus=null;
    if(authId){
      const ar=await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authId}`,{method:'DELETE',headers:{apikey:SERVICE_ROLE_KEY,Authorization:`Bearer ${SERVICE_ROLE_KEY}`}});
      authDeleteStatus=ar.status;
    }
    const del=await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`,{method:'DELETE',headers:{apikey:SERVICE_ROLE_KEY,Authorization:`Bearer ${SERVICE_ROLE_KEY}`,'Prefer':'return=minimal'}});
    const text=await del.text();
    if(!del.ok) return res.status(del.status).json({error:text||'Не вдалося видалити профіль'});
    return res.status(200).json({ok:true,authDeleteStatus});
  }catch(e){return res.status(500).json({error:e.message||'Unknown error'});}
}
