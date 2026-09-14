// Loaded only into the disposable staging process, never into an operational release.
const fs=require('node:fs');
if(process.env.CI!=='true')throw new Error('Staging transport is CI-only');
const settings=JSON.parse(fs.readFileSync(process.env.STAGING_BRIDGE_FILE,'utf8'));
for(const target of [settings.api,settings.provider])if(new URL(target).hostname!=='127.0.0.1')throw new Error('Staging transport requires loopback');
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
  if(url.hostname==='supabase.example.test'){
    if(url.pathname.endsWith('/advance_generation_attempt')&&fs.existsSync(settings.faultFile)){
      const body=JSON.parse(init?.body??'{}');
      if(body.p_patch?.state==='submitted'){fs.renameSync(settings.faultFile,settings.faultFile+'.triggered');return Response.json({message:'injected acceptance write failure'},{status:503});}
    }
    if(headers.get('apikey')==='fixture-only')headers.set('apikey',settings.serviceKey);
    if(headers.get('authorization')==='Bearer fixture-only')headers.set('authorization',`Bearer ${settings.serviceKey}`);
    return nativeFetch(new URL(url.pathname+url.search,settings.api),{...init,headers});
  }
  if(url.hostname.endsWith('.fal.run')||url.hostname==='fal.run'||url.hostname==='api.anthropic.com')
    return nativeFetch(new URL(`/provider?target=${encodeURIComponent(url.href)}`,settings.provider),{...init,headers});
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Unexpected external request in isolated staging');
  return nativeFetch(input,init);
};
