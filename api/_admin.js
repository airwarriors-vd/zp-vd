export async function getEnv(){
  const SUPABASE_URL=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY) throw new Error('Server env variables are missing');
  return {SUPABASE_URL,SERVICE_ROLE_KEY};
}
export async function requireAdmin(req){
  const {SUPABASE_URL,SERVICE_ROLE_KEY}=await getEnv();
  const auth=req.headers.authorization||req.headers.Authorization||'';
  if(!auth.startsWith('Bearer ')) throw new Error('Unauthorized');
  const userResp=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SERVICE_ROLE_KEY,Authorization:auth}});
  const user=await userResp.json().catch(()=>null);
  if(!userResp.ok||!user?.id) throw new Error('Unauthorized');
  const profResp=await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,role&or=(auth_id.eq.${user.id},auth_user_id.eq.${user.id},id.eq.${user.id},email.eq.${encodeURIComponent(user.email||'')})`,{headers:{apikey:SERVICE_ROLE_KEY,Authorization:`Bearer ${SERVICE_ROLE_KEY}`}});
  const prof=await profResp.json().catch(()=>[]);
  if(!profResp.ok||!prof?.[0]||prof[0].role!=='admin') throw new Error('Admin only');
  return {SUPABASE_URL,SERVICE_ROLE_KEY,authUser:user,profile:prof[0]};
}
export async function readJson(req){
  if(req.body&&typeof req.body==='object') return req.body;
  let raw='';
  await new Promise((resolve,reject)=>{req.on('data',c=>raw+=c); req.on('end',resolve); req.on('error',reject);});
  try{return raw?JSON.parse(raw):{};}catch{return {};}
}
