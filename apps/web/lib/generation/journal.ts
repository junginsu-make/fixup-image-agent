import "server-only";
import { mkdir, open, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled, localStoreRoot } from "../local-store";
export interface AcceptanceRecord {runId:string;attemptId:string;providerRequestId:string;at?:string}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function journalRoot(){return process.env.GENERATION_JOURNAL_DIR??(isLocalStoreEnabled()?path.join(localStoreRoot(),"generation-journal"):"/var/lib/fixup-image-agent/generation");}
export async function replayAcceptanceJournal(root=journalRoot(),apply:(record:AcceptanceRecord)=>Promise<boolean>=async record=>{
  const{data,error}=await createSupabaseAdminClient().rpc("recover_generation_acceptance",{p_run:record.runId,p_attempt:record.attemptId,p_provider_id:record.providerRequestId});
  if(error)throw new Error("journal_recovery_failed");return data===true;
}){
  await mkdir(root,{recursive:true,mode:0o700});
  const file=path.join(root,"accepted.jsonl");const cursorFile=path.join(root,"accepted.cursor.json");
  const writable=await open(file,"a",0o600);await writable.close();
  let offset=0;
  try {offset=JSON.parse(await readFile(cursorFile,"utf8")).offset;}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  if(!Number.isSafeInteger(offset)||offset<0)throw new Error("journal_cursor_invalid");
  const handle=await open(file,"r");let bytes:Buffer;
  try {
    const info=await handle.stat();if(info.size<offset)throw new Error("journal_reset_requires_review");
    const buffer=Buffer.alloc(Math.min(65536,info.size-offset));
    const read=await handle.read(buffer,0,buffer.length,offset);bytes=buffer.subarray(0,read.bytesRead);
  }finally{await handle.close();}
  let consumed=0;let recovered=0;
  try{for(;;){
    if(recovered>=32)break;
    const end=bytes.indexOf(10,consumed);if(end<0)break;
    const text=bytes.subarray(consumed,end).toString("utf8").trim();
    if(text){
      const record=JSON.parse(text) as AcceptanceRecord;
      if(!UUID.test(record.runId)||!UUID.test(record.attemptId)||!/^[-_a-z0-9]{1,256}$/i.test(record.providerRequestId))throw new Error("journal_record_invalid");
      if(!(await apply(record)))break;
      recovered++;
    }
    consumed=end+1;
  }}finally{
    if(consumed){const temporary=`${cursorFile}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify({offset:offset+consumed}),{mode:0o600,flush:true});await rename(temporary,cursorFile);}
  }
  return recovered;
}
