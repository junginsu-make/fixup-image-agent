import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled, localStoreRoot } from "../local-store";
import { assertStoragePath } from "../storage/safe-path";
import type { GenerationRun } from "./types";
const BUCKET="generation-internal";
function key(run:GenerationRun,name:string){const value=`${run.user_id}/${run.id}/${name}.json`;assertStoragePath(value);return value;}
export async function writeCachedResult(run:GenerationRun,value:unknown,name="result") {
  const target=key(run,name);const bytes=Buffer.from(JSON.stringify({runId:run.id,value}));
  if(bytes.length>64*1024*1024)throw new Error("result_too_large");
  if(isLocalStoreEnabled()){
    const file=path.join(localStoreRoot(),"generation-internal",...target.split("/"));await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);return target;
  }
  const {error}=await createSupabaseAdminClient().storage.from(BUCKET).upload(target,bytes,{contentType:"application/json",upsert:true});
  if(error)throw new Error("result_storage_unavailable");return target;
}
export async function readCachedResult<T>(run:GenerationRun,name="result"):Promise<T|undefined> {
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
  if(decoded.runId!==run.id)throw new Error("result_identity_mismatch");return decoded.value;
}
