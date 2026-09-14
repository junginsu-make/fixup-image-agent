import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdtemp,readFile,writeFile,mkdir,copyFile,realpath,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { buildPosterJob,EMPTY_SLOTS } from '../packages/poster-core/src/index.ts';
import { quoteQueuedImages } from '../apps/web/lib/sns/queued-flow.ts';
import { stagingSupabase } from './lib/staging-supabase.mjs';
const exec=promisify(execFile);const require=createRequire(import.meta.url);const sharp=require('../apps/web/node_modules/sharp');
const api=await stagingSupabase();const root=path.resolve(process.argv[2]);
const release=JSON.parse(await readFile(path.join(root,'RELEASE_INFO.json'),'utf8'));assert.equal(release.publicSiteOrigin,'https://studio.example.test:8443');
const parent=await realpath(tmpdir());const scratch=await mkdtemp(path.join(parent,'fixup-executor-staging-'));const journal=path.join(scratch,'journal');
const unique=randomUUID();const unit=`fixup-staging-${unique}`;const helperRoot=`/opt/${unit}`;
const png=await sharp({create:{width:1024,height:1536,channels:4,background:'#aabbcc'}}).png().toBuffer();
const jobs=new Map();let submissions=0,llmCalls=0;
const provider=createServer(async(request,response)=>{
  if(request.url==='/image.png'){response.setHeader('content-type','image/png');response.end(png);return;}
  const target=new URL(new URL(request.url,'http://localhost').searchParams.get('target'));
  const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  response.setHeader('content-type','application/json');
  if(target.hostname==='api.anthropic.com'){
    llmCalls++;const tool=body.tools?.[0];
    response.end(JSON.stringify({id:randomUUID(),type:'message',role:'assistant',model:body.model,stop_reason:tool?'tool_use':'end_turn',usage:{input_tokens:10,output_tokens:5},content:tool?[{type:'tool_use',id:randomUUID(),name:tool.name,input:{decision:'pass',summary:'ok',issues:[],textFidelity:{headline:'exact',body:'not_applicable',accent:'not_applicable',footnote:'not_applicable'},extraCopy:{status:'none',texts:[]}}}]:[{type:'text',text:'A simple scene'}]}));return;
  }
  if(request.method==='POST'){
    const id=randomUUID();submissions++;jobs.set(id,Number(body.num_images??1));
    response.end(JSON.stringify({status:'IN_QUEUE',request_id:id,response_url:`${target.origin}${target.pathname}/requests/${id}`,status_url:`${target.origin}${target.pathname}/requests/${id}/status`,cancel_url:`${target.origin}${target.pathname}/requests/${id}/cancel`}));return;
  }
  const id=/\/requests\/([^/]+)/.exec(target.pathname)?.[1];assert.ok(jobs.has(id),'Provider request ID must come from this run');
  response.end(JSON.stringify(target.pathname.endsWith('/status')?{status:'COMPLETED',request_id:id,logs:[]}:{images:Array.from({length:jobs.get(id)},()=>({url:`http://127.0.0.1:${provider.address().port}/image.png`}))}));
});provider.listen(0,'127.0.0.1');await once(provider,'listening');
const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
const secret=randomUUID()+randomUUID();const faultFile=path.join(scratch,'fail-acceptance');const bridgeFile=path.join(scratch,'bridge.json');
await writeFile(bridgeFile,JSON.stringify({api:api.base.href,serviceKey:api.status.SERVICE_ROLE_KEY,provider:`http://127.0.0.1:${provider.address().port}`,faultFile}),{mode:0o600});
let web;let log='';let peakRssKb=0;let installed=false;
async function waitFor(probe,label,timeout=120000){const deadline=Date.now()+timeout;for(;;){if(await probe())return;if(Date.now()>deadline)throw new Error(`Timed out: ${label}`);await new Promise(r=>setTimeout(r,300));}}
async function startWeb(){
  web=spawn(process.execPath,['-r',path.resolve('scripts/fixtures/staging-transport.cjs'),'server.js'],{cwd:path.join(root,'apps/web'),stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),STAGING_BRIDGE_FILE:bridgeFile,GENERATION_EXECUTOR_SECRET:secret,GENERATION_EXECUTOR_ID:'staging',GENERATION_JOURNAL_DIR:journal,SUPABASE_SECRET_KEY:'fixture-only',FAL_KEY:'fixture-only',ANTHROPIC_API_KEY:'fixture-only',OPENAI_API_KEY:'fixture-only'}});
  web.stdout.on('data',b=>{log=(log+b).slice(-12000);});web.stderr.on('data',b=>{log=(log+b).slice(-12000);});
  await waitFor(async()=>{try{return (await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},'web startup');
}
async function stopWeb(signal='SIGTERM'){if(web?.exitCode===null){const stopped=once(web,'exit');web.kill(signal);await stopped;}}
const rpc=(name,body)=>api.json(`/rest/v1/rpc/${name}`,{method:'POST',body});
const runRow=async id=>(await api.json(`/rest/v1/generation_runs?id=eq.${id}&select=*`))[0];
async function sampleRss(){if(web?.pid){const status=await readFile(`/proc/${web.pid}/status`,'utf8').catch(()=>'');peakRssKb=Math.max(peakRssKb,Number(/VmHWM:\s+(\d+)/.exec(status)?.[1]??0));}}
let samples;
try{
  await startWeb();samples=setInterval(()=>{void sampleRss();},300);
  const owner=(await api.json('/auth/v1/admin/users')).users.find(user=>user.email==='ledger-boundary@example.test');assert.ok(owner);
  await api.json(`/rest/v1/profiles?id=eq.${owner.id}`,{method:'PATCH',body:{role:'admin',status:'active',monthly_quota:100}});
  await rpc('record_generation_executor_tick',{p_executor:'staging',p_release:release.releaseId,p_ok:true,p_error:null});
  await rpc('set_generation_controls',{p_actor:owner.id,p_enabled:true,p_daily:1000000000,p_unresolved:1000000000,p_reason:'Disposable fake-provider test only'});
  await exec('sudo',['mkdir','-p',`${helperRoot}/ops`]);
  await exec('sudo',['cp',path.join(root,'ops/generation-tick.mjs'),`${helperRoot}/ops/generation-tick.mjs`]);await exec('sudo',['cp',path.join(root,'RELEASE_INFO.json'),`${helperRoot}/RELEASE_INFO.json`]);
  const envFile=path.join(scratch,'helper.env');await writeFile(envFile,`GENERATION_EXECUTOR_SECRET=${secret}\nGENERATION_INTERNAL_PORT=${port}\n`,{mode:0o600});
  const user=(await exec('id',['-un'])).stdout.trim();const group=(await exec('id',['-gn'])).stdout.trim();
  const service=(await readFile('deploy/ec2/fixup-image-agent-generation-tick.service','utf8')).replaceAll('fixup-agent',user).replace(`Group=${user}`,`Group=${group}`).replaceAll('/opt/fixup-image-agent/current',helperRoot).replace('/etc/fixup-image-agent/app.env',envFile);
  const timer=(await readFile('deploy/ec2/fixup-image-agent-generation-tick.timer','utf8')).replaceAll('fixup-image-agent-generation-tick',unit).replace('OnBootSec=15s','OnActiveSec=1s').replace('OnUnitInactiveSec=5s','OnUnitInactiveSec=2s');
  await writeFile(path.join(scratch,'tick.service'),service);await writeFile(path.join(scratch,'tick.timer'),timer);
  await exec('sudo',['cp',path.join(scratch,'tick.service'),`/run/systemd/system/${unit}.service`]);await exec('sudo',['cp',path.join(scratch,'tick.timer'),`/run/systemd/system/${unit}.timer`]);installed=true;
  await exec('sudo',['systemctl','mask','--runtime','fixup-image-agent-worker.service']);await exec('sudo',['systemctl','daemon-reload']);
  const project=randomUUID();const job={projectId:project,modelId:'gpt-image-2',ratioId:'2:3',variants:2,slots:{...EMPTY_SLOTS,headline:'fixture',scene:'fixture'},referenceUrls:[],preservedUrls:[]};const built=buildPosterJob(job);assert.ok(!built.rejected);
  await api.json('/rest/v1/poster_projects',{method:'POST',body:{id:project,user_id:owner.id,title:'Restart fixture',ratio:'2:3',model_id:job.modelId}});
  const units=Math.ceil(built.estimate.totalUsd/0.05);
  const input={userId:owner.id,key:randomUUID(),operation:'poster_image',units,resourceType:'poster',resourceId:project,inputHash:'a'.repeat(64),maxCostMicrousd:Math.ceil(built.estimate.totalUsd*1000000),snapshot:{kind:'poster',job,built}};
  await writeFile(faultFile,'fail exactly one acceptance checkpoint');const run=await rpc('begin_generation_v2',{p_input:input});
  await exec('sudo',['systemctl','start',`${unit}.timer`]);
  await waitFor(async()=>Boolean((await readFile(path.join(journal,'accepted.jsonl'),'utf8').catch(()=>'' )).trim()),'durable acceptance journal');
  assert.equal(submissions,1);const before=await runRow(run.id);assert.ok(!['succeeded','failed','cancelled'].includes(before.state));
  await stopWeb('SIGKILL');
  // Advance only the dead worker's lease clock; do not wait 210 seconds in CI.
  await api.json(`/rest/v1/generation_runs?id=eq.${run.id}`,{method:'PATCH',body:{lease_until:new Date(Date.now()-1000).toISOString()}});
  await startWeb();await waitFor(async()=>(await runRow(run.id)).state==='succeeded','poster recovery');
  assert.equal(submissions,1);assert.equal((await api.json(`/rest/v1/poster_images?project_id=eq.${project}&select=id`)).length,2);
  const event=(await api.json(`/rest/v1/generation_events?id=eq.${run.event_id}`))[0];assert.equal(event.consumed_units,units);
  const snsId=randomUUID();const flow={stage:'result',planningIssues:[],copyIssues:[],costs:[],generation:{startedAt:new Date().toISOString(),selectedCardIndexes:[1,2],falReferenceUrls:{}},cards:[1,2].map(index=>({index,kind:'generated',role:'body',copy:{index,headline:'fixture'},status:'pending'}))};
  const snsProject={id:snsId,userId:owner.id,modelId:'nano-banana',ratio:'4:5',language:'ko',data:{attachments:[],flow,source:{kind:'text',text:'fixture'}}};
  await api.json('/rest/v1/sns_projects',{method:'POST',body:{id:snsId,user_id:owner.id,title:'No browser fixture',ratio:'4:5',language:'ko',model_id:'nano-banana',data:snsProject.data}});
  const sns=await rpc('begin_generation_v2',{p_input:{userId:owner.id,key:randomUUID(),operation:'sns_image',resourceType:'sns',resourceId:snsId,units:20,maxCostMicrousd:100000000,inputHash:'b'.repeat(64),snapshot:{kind:'sns',project:snsProject,initialFlow:flow,selected:[1,2],models:{ANTHROPIC_MODEL:'claude-sonnet-5',OPENAI_DRAFT_MODEL:'gpt-5.6-sol',OPENAI_VISION_MODEL:'gpt-5.6-sol'},imagePrices:quoteQueuedImages(snsProject,flow,[1,2])}}});
  await waitFor(async()=>(await runRow(sns.id)).state==='succeeded','SNS without browser',180000);assert.equal(submissions,3);assert.equal(llmCalls,4);
  assert.equal((await api.json(`/rest/v1/sns_cards?project_id=eq.${snsId}&status=eq.done&select=id`)).length,2);
  const second=(await api.json(`/rest/v1/generation_events?id=eq.${sns.event_id}`))[0];assert.ok(second.consumed_units>0);
  await exec('sudo',['systemctl','stop',`${unit}.timer`,`${unit}.service`]);
  await api.json('/rest/v1/generation_executor_health?executor_id=eq.staging',{method:'PATCH',body:{succeeded_at:new Date(Date.now()-360000).toISOString(),error_code:null}});
  const denied=await api.request('/rest/v1/rpc/begin_generation_v2',{method:'POST',body:{p_input:{...input,key:randomUUID()}}});assert.ok(!denied.ok);assert.match(await denied.text(),/executor_unavailable/);
  assert.equal((await api.json(`/rest/v1/generation_events?id=eq.${run.event_id}`))[0].consumed_units,units);
  console.log(JSON.stringify({passed:['T02','T10','T11','T19','T23','T28'],providerSubmissions:submissions,llmCalls,posterImages:2,snsImages:2,peakWebRssMiB:Math.ceil(peakRssKb/1024),scope:'Real Supabase and packaged runtime/systemd; fake providers; dead-worker lease time advanced'}));
}catch(error){console.error(log);if(installed)console.error((await exec('sudo',['journalctl','-u',`${unit}.service`,'-n','30','--no-pager']).catch(()=>({stdout:''}))).stdout);throw error;}
finally{
  clearInterval(samples);if(installed){await exec('sudo',['systemctl','stop',`${unit}.timer`,`${unit}.service`]).catch(()=>{});await exec('sudo',['rm','-f',`/run/systemd/system/${unit}.timer`,`/run/systemd/system/${unit}.service`]);await exec('sudo',['systemctl','daemon-reload']);await exec('sudo',['systemctl','unmask','--runtime','fixup-image-agent-worker.service']);}
  await stopWeb();provider.closeAllConnections();await new Promise(r=>provider.close(r));
  const actual=await realpath(scratch);assert.equal(path.dirname(actual),parent);assert.ok(path.basename(actual).startsWith('fixup-executor-staging-'));await rm(actual,{recursive:true});
  // helperRoot is a fixed /opt prefix plus a generated UUID, never user input.
  assert.match(helperRoot,/^\/opt\/fixup-staging-[0-9a-f-]{36}$/);await exec('sudo',['rm','-rf','--',helperRoot]);
}
