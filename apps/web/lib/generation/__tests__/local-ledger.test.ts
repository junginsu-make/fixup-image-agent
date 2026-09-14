import { it,expect,vi } from "vitest";
import {mkdtemp,rm,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
vi.mock("server-only",()=>({}));
import {LocalDatabase} from "../../local-store";
import {localLedger} from "../local-ledger";
it("local run and accepted provider identity survive reopening the file store",async()=>{
  const parent=await realpath(tmpdir());const dir=await mkdtemp(path.join(parent,"fixup-local-run-"));
  try {
    const db=new LocalDatabase(dir);
    await db.update(raw=>{(raw as unknown as {posterProjects:unknown[]}).posterProjects=[{id:"project",userId:"owner",status:"draft",data:{}}];});
    const ledger=localLedger(db);
    const input={userId:"owner",key:"key",operation:"poster_image",units:8,resourceType:"poster" as const,resourceId:"project",snapshot:{},inputHash:"hash",maxCostMicrousd:400000};
    const run=await ledger.begin(input);const claimed=await ledger.claim(run.id);expect(claimed).not.toBeNull();
    const store=ledger.execution(claimed!);
    const a=await store.prepare({step:"poster",sequence:0,provider:"fal",model:"m",endpoint:"e",requestHash:"h",payload:{},price:{chargeUnitMicrousd:400000},maxCostMicrousd:400000,requestedImages:1});
    await store.advance(a.id,{state:"submitting"});await store.advance(a.id,{state:"submitted",providerRequestId:"accepted"});
    const reopened=localLedger(new LocalDatabase(dir));expect((await reopened.begin(input)).id).toBe(run.id);
    const resumed=reopened.execution(claimed!);expect((await resumed.attempts())[0]!.provider_request_id).toBe("accepted");
    await resumed.advance(a.id,{state:"result_ready",returnedImages:1,output:{images:[]}});
    await resumed.advance(a.id,{state:"stored",deliveredImages:1,output:{paths:["owned"]}});
    await resumed.checkpoint({},"settlement_pending",0);await resumed.settle();await resumed.settle();
    expect((await reopened.existing("owner","key"))?.consumed_units).toBe(8);
  } finally {
    const resolved=await realpath(dir);if(path.dirname(resolved)!==parent)throw new Error("Unexpected test path");await rm(resolved,{recursive:true});
  }
});
