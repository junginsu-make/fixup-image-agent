// Test-only transport. Never imported by the application or copied into a release.
const id='10000000-0000-4000-8000-000000000001';
const user={id,email:'security@example.test',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]};
function token(){const b=value=>Buffer.from(JSON.stringify(value)).toString('base64url');return `${b({alg:'HS256',typ:'JWT'})}.${b({sub:id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})}.fixture`;}
function session(){return {access_token:token(),refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};}
function reply(url,method='GET',headers={}){
  const path=new URL(url).pathname;let body={};
  if(path==='/auth/v1/token'||path==='/auth/v1/verify')body=session();
  else if(path==='/auth/v1/signup')body={...user,email_confirmed_at:null};
  else if(path==='/auth/v1/user')body=user;
  else if(path.startsWith('/rest/v1/profiles'))body={...user,status:'active',role:'admin',monthly_quota:30};
  else if(path.startsWith('/rest/v1/rpc/member_usage_summary'))body=[{used_units:0,reserved_units:0,quota:30,current_period_start:'2026-09-01',current_period_end:'2026-10-01'}];
  else if(path.startsWith('/rest/v1/'))body=[];
  return {status:200,headers:{'content-type':'application/json','access-control-allow-origin':'https://studio.example.test','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'},body:JSON.stringify(body)};
}
module.exports={reply,user,session};
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.hostname==='supabase.example.test'){const r=reply(url,init?.method);return new Response(r.body,{status:r.status,headers:r.headers});}
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('External network disabled in security fixture');
  return original(input,init);
};
