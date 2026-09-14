import "server-only";
import { readFile, writeFile, mkdir, link, unlink, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled, localStoreRoot } from "../local-store";
import { assertStoragePath } from "../storage/safe-path";
import type { GenerationRun } from "./types";
const BUCKET="generation-internal";
function key(run:GenerationRun,name:string){const value=`${run.user_id}/${run.id}/${name}.json`;assertStoragePath(value);return value;}
export async function writeCachedResult(run:GenerationRun,value:unknown,name="result") {
  if(name==="result")name=`result-${run.lease_epoch??0}`;
  const target=key(run,name);const bytes=Buffer.from(JSON.stringify({runId:run.id,value}));
  if(bytes.length>64*1024*1024)throw new Error("result_too_large");
  if(isLocalStoreEnabled()){
    const file=path.join(localStoreRoot(),"generation-internal",...target.split("/"));await mkdir(path.dirname(file),{recursive:true});
    const temporary=`${file}.${randomUUID()}.tmp`;
    await writeFile(temporary,bytes,{flag:"wx"});
    try { await link(temporary,file); }
    catch(error) { if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error; if(!(await readFile(file)).equals(bytes))throw new Error("result_conflict"); }
    finally { await unlink(temporary); }
    return target;
  }
  const bucket=createSupabaseAdminClient().storage.from(BUCKET);
  const {error}=await bucket.upload(target,bytes,{contentType:"application/json",upsert:false});
  if(error){
    if(!["409","400"].includes(String(error.statusCode))&&!/already exists|duplicate/i.test(error.message))throw new Error("result_storage_unavailable");
    const existing=await bucket.download(target);
    if(existing.error||!existing.data)throw new Error("result_storage_unavailable");
    if(!Buffer.from(await existing.data.arrayBuffer()).equals(bytes))throw new Error("result_conflict");
  }
  return target;
}
async function readNamed<T>(run:GenerationRun,name:string):Promise<{value:T;path:string}|undefined> {
  const target=key(run,name);let bytes:Buffer;
  if(isLocalStoreEnabled()) {
    try{bytes=await readFile(path.join(localStoreRoot(),"generation-internal",...target.split("/")));}
    catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;}
  } else {
    const {data,error}=await createSupabaseAdminClient().storage.from(BUCKET).download(target);
    if(error){if(String(error.statusCode)==="404"||/not found/i.test(error.message))return undefined;throw new Error("result_storage_unavailable");}
    if(!data)return undefined;bytes=Buffer.from(await data.arrayBuffer());
  }
  const decoded=JSON.parse(bytes.toString("utf8")) as {runId:string;value:T};
  if(decoded.runId!==run.id)throw new Error("result_identity_mismatch");return {value:decoded.value,path:target};
}
export async function readCachedResultEntry<T>(run:GenerationRun,name="result"):Promise<{value:T;path:string}|undefined> {
  if(name!=="result")return readNamed<T>(run,name);
  const prefix=`${run.user_id}/${run.id}/`;
  const published=run.checkpoint?.resultRef;
  const names:string[]=[];
  if(typeof published==="string"&&published.startsWith(prefix)&&published.endsWith(".json"))names.push(published.slice(prefix.length,-5));
  names.push(`result-${run.lease_epoch??0}`,"result");
  for(const candidate of new Set(names)){const found=await readNamed<T>(run,candidate);if(found)return found;}
  // A worker can stop after the object write but before publishing its pointer.
  let files:string[];
  if(isLocalStoreEnabled()){
    try{files=await readdir(path.join(localStoreRoot(),"generation-internal",...prefix.split("/")));}
    catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;}
  }else{
    const {data,error}=await createSupabaseAdminClient().storage.from(BUCKET).list(prefix.slice(0,-1),{limit:1000,sortBy:{column:"name",order:"desc"}});
    if(error)throw new Error("result_storage_unavailable");files=(data??[]).map(file=>file.name);
  }
  const candidates=files.map(file=>/^result-(\d+)\.json$/.exec(file)).filter((match):match is RegExpExecArray=>Boolean(match))
    .filter(match=>Number(match[1])<=(run.lease_epoch??0)).sort((a,b)=>Number(b[1])-Number(a[1]));
  for(const candidate of candidates){const found=await readNamed<T>(run,candidate[0].slice(0,-5));if(found)return found;}
  return undefined;
}
export async function readCachedResult<T>(run:GenerationRun,name="result"):Promise<T|undefined> {
  return (await readCachedResultEntry<T>(run,name))?.value;
}
