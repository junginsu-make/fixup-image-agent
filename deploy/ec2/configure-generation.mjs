import {readFile,writeFile,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const file=process.env.NODE_ENV==='test'&&process.env.GENERATION_ENV_FILE?process.env.GENERATION_ENV_FILE:'/etc/fixup-image-agent/app.env';
try{
  const [mode,manifestFile,stateFile]=process.argv.slice(2);
  if(!['--pause','--resume','--drain'].includes(mode)||!manifestFile||!stateFile)throw new Error('arguments_invalid');
  const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
  if(manifest.generationProtocol!==2||!Number.isInteger(manifest.generationSchemaVersion)||manifest.generationSchemaMin!==manifest.generationSchemaVersion||!Number.isInteger(manifest.generationSchemaMax)||manifest.generationSchemaMax<manifest.generationSchemaMin||!/^[a-f0-9]{40}$/.test(manifest.releaseId??''))throw new Error('release_incompatible');
  let text=await readFile(file,'utf8');
  const values=Object.fromEntries(text.split(/\r?\n/).flatMap(line=>{
    const match=/^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());if(!match)return[];
    let value=match[2].trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    return[[match[1],value]];
  }));
  if(!values.GENERATION_EXECUTOR_SECRET){
    const line=`GENERATION_EXECUTOR_SECRET=${randomBytes(32).toString('hex')}`;
    text=/^GENERATION_EXECUTOR_SECRET\s*=/m.test(text)?text.replace(/^GENERATION_EXECUTOR_SECRET\s*=.*$/m,line):`${text.trimEnd()}\n${line}\n`;
    await writeFile(file,text,{mode:0o640});await chmod(file,0o640);
  }else if(values.GENERATION_EXECUTOR_SECRET.length<32)throw new Error('executor_secret_invalid');
  const url=new URL(values.NEXT_PUBLIC_SUPABASE_URL);if(url.protocol!=='https:'&&process.env.NODE_ENV!=='test')throw new Error('database_url_invalid');
  const key=values.SUPABASE_SECRET_KEY;if(!key)throw new Error('database_key_missing');
  const rpc=async(name,body)=>{
    const response=await fetch(new URL(`/rest/v1/rpc/${name}`,url),{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('database_control_failed');return response.json();
  };
  if(mode==='--drain'){
    const deadline=Date.now()+240000;
    for(;;){
      const status=await rpc('generation_runtime_status',{});
      if(status.admissionEnabled)throw new Error('admission_not_paused');
      if(status.activeInline===0)break;
      if(Date.now()>=deadline)throw new Error('inline_requests_still_running');
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    console.log('Inline generation requests drained.');
  }else if(mode==='--pause'){
    const state=await rpc('pause_generation_for_deploy',{p_release:manifest.releaseId});
    await writeFile(stateFile,JSON.stringify(state),{mode:0o600});
    if(state.activeLegacy>0)throw new Error('legacy_requests_require_review');
    console.log('Generation admission paused.');
  }else{
    const state=JSON.parse(await readFile(stateFile,'utf8'));
    const restored=await rpc('resume_generation_after_deploy',{p_pause:state.pauseId,p_release:manifest.releaseId});
    console.log(restored?'Previous admission policy restored.':'Operator policy changed; preserving the newer policy.');
  }
}catch(error){
  const known=['executor_secret_invalid','arguments_invalid','release_incompatible','database_url_invalid','database_key_missing','database_control_failed','legacy_requests_require_review','admission_not_paused','inline_requests_still_running'];
  console.error(`Generation configuration: ${known.includes(error?.message)?error.message:'configuration_failed'}`);process.exitCode=1;
}
