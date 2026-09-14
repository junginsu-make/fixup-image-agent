import {readFile} from 'node:fs/promises';
const secret=process.env.GENERATION_EXECUTOR_SECRET;
try{
  if(!secret||secret.length<32)throw new Error('secret_missing');
  const release=JSON.parse(await readFile(new URL('../RELEASE_INFO.json',import.meta.url),'utf8'));
  if(release.generationProtocol!==2||!Number.isInteger(release.generationSchemaVersion)||release.generationSchemaMin!==release.generationSchemaVersion||!Number.isInteger(release.generationSchemaMax)||release.generationSchemaMax<release.generationSchemaMin||!/^[a-f0-9]{40}$/.test(release.releaseId??''))throw new Error('release_incompatible');
  const port=Number(process.env.GENERATION_INTERNAL_PORT??3000);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('invalid_loopback_port');
  const check=process.argv.includes('--check');
  const response=await fetch(`http://127.0.0.1:${port}/api/internal/generation/tick`,{
    method:check?'GET':'POST',
    headers:{authorization:`Bearer ${secret}`,'x-generation-release':release.releaseId,'x-generation-protocol':'2','content-type':'application/json'},
    ...(check?{}:{body:'{}'}),signal:AbortSignal.timeout(180000),
  });
  if(!response.ok)throw new Error('executor_unavailable');
  const result=await response.json();
  if(!result.ok||result.protocol!==2||!(result.schemaVersion>=release.generationSchemaMin&&result.schemaVersion<=release.generationSchemaMax)||result.releaseId!==release.releaseId)throw new Error('executor_incompatible');
  console.log(JSON.stringify({ok:true,checked:check,processed:result.processed??false,releaseId:release.releaseId}));
}catch(error){
  const known=['secret_missing','release_incompatible','invalid_loopback_port','executor_unavailable','executor_incompatible'];
  console.error(`Generation executor: ${known.includes(error?.message)?error.message:'request_failed'}`);
  process.exitCode=1;
}
