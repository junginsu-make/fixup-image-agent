import { authorizedGenerationExecutor } from "../../../../../lib/generation/internal-auth";
import { generationRuntime, generationRuntimeStatus } from "../../../../../lib/generation/runtime";
import { executeGenerationTick, executorDependencies } from "../../../../../lib/generation/executor";
import { boundedBytes } from "../../../../../lib/generation/request-body";
import { withExecutionDeadline } from "../../../../../lib/generation/deadline";
import { GENERATION_SCHEMA_VERSION } from "../../../../../lib/generation/operations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=150;
async function authenticate(request:Request){
  const claimed=request.headers.get("x-generation-release")??"";
  if(!authorizedGenerationExecutor(request,process.env.GENERATION_EXECUTOR_SECRET,claimed))return null;
  const info=await generationRuntime();
  return authorizedGenerationExecutor(request,process.env.GENERATION_EXECUTOR_SECRET,info.releaseId)?info:null;
}
export async function GET(request:Request){
  try{
    const info=await authenticate(request);if(!info)return new Response(null,{status:404});
    const status=await withExecutionDeadline(Date.now()+30000,false,()=>generationRuntimeStatus(info));
    return Response.json(status,{status:status.ok?200:503});
  }catch{return Response.json({ok:false,code:"generation_not_ready"},{status:503});}
}
export async function POST(request:Request){
  try{
    const info=await authenticate(request);if(!info)return new Response(null,{status:404});
    if(new URL(request.url).search)return new Response(null,{status:400});
    const body=request.body?(await boundedBytes(request,64)).toString("utf8").trim():"";
    if(body&&body!=="{}")return new Response(null,{status:400});
    const schema=await withExecutionDeadline(Date.now()+30000,false,()=>generationRuntimeStatus(info));
    if(schema.protocol!==2||schema.schemaVersion!==GENERATION_SCHEMA_VERSION)return Response.json({ok:false,code:"schema_incompatible"},{status:503});
    const result=await executeGenerationTick(executorDependencies(info));
    return Response.json({...result,protocol:2,schemaVersion:GENERATION_SCHEMA_VERSION,releaseId:info.releaseId},{status:result.ok?200:503});
  }catch{
    console.error("[generation] executor_tick_failed");
    return Response.json({ok:false,code:"executor_tick_failed"},{status:503});
  }
}
