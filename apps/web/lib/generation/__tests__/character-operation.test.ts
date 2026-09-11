import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({ authenticateApiMember: async () => ({ ok:true,member:{userId:"owner"} }) }));
const fail=vi.hoisted(()=>({result:false,settlement:false}));
vi.mock("../result-cache",async()=>{
  const actual=await vi.importActual<typeof import("../result-cache")>("../result-cache");
  return {...actual,writeCachedResult:async(run:Parameters<typeof actual.writeCachedResult>[0],value:unknown,name?:string)=>{
    if(fail.result&&name===undefined)throw new Error("result_storage_unavailable");
    return actual.writeCachedResult(run,value,name);
  }};
});
vi.mock("../run-store",async()=>{
  const actual=await vi.importActual<typeof import("../run-store")>("../run-store");
  return {...actual,executionStore:(run:Parameters<typeof actual.executionStore>[0])=>{
    const store=actual.executionStore(run);return{...store,settle:async()=>{if(fail.settlement)throw new Error("database unavailable");return store.settle();}};
  }};
});
import { POST, DELETE } from "../../../app/api/characters/route";
import { POST as regenerate } from "../../../app/api/characters/views/route";
import { getLocalDatabase } from "../../local-store";
import { localLedger } from "../local-ledger";
let root:string;let parent:string;let paid:number;
beforeEach(async()=>{
  parent=await realpath(tmpdir());root=await mkdtemp(path.join(parent,"fixup-character-test-"));
  vi.stubEnv("LOCAL_STORE","1");vi.stubEnv("LOCAL_STORE_ROOT",root);vi.stubEnv("GENERATION_EXECUTION_V2","1");vi.stubEnv("FAL_KEY","fake");
  fail.result=false;fail.settlement=false;paid=0;
  vi.stubGlobal("fetch",async(url:string)=>{
    if(url.startsWith("https://fal.run/")){paid++;return Response.json({images:[{url:"https://example.invalid/image.png",content_type:"image/png"}]});}
    if(url==="https://example.invalid/image.png")return new Response(new Uint8Array([1,2,3]));
    throw new Error("Unexpected network request");
  });
});
afterEach(async()=>{
  vi.unstubAllEnvs();vi.unstubAllGlobals();const target=await realpath(root);
  if(path.dirname(target)!==parent||!path.basename(target).startsWith("fixup-character-test-"))throw new Error("Unexpected cleanup target");
  await rm(target,{recursive:true});
});
const request=(key:string,body:unknown,method="POST")=>new Request("https://example.invalid/api/characters",{method,headers:{"x-generation-protocol":"2","x-idempotency-key":key},body:JSON.stringify(body)});
const body={step:"create",description:"person",name:"test",chosenBase64:"AQID",chosenMimeType:"image/png",modelId:"gpt-image-2",angles:["left_45"],sheet:true};
async function expire(){await getLocalDatabase().update(data=>{for(const run of (data as unknown as {generationRuns:Array<{lease_until:string}>}).generationRuns)run.lease_until="2000-01-01T00:00:00Z";});}
it("candidate billing follows actual model price instead of raw image count",async()=>{
  const key=randomUUID();const response=await POST(request(key,{...body,step:"candidates",candidates:2}));
  expect(response.status).toBe(200);expect((await response.json()).candidates).toHaveLength(2);
  expect((await localLedger().existing("owner",key))?.consumed_units).toBeGreaterThan(2);expect(paid).toBe(2);
});
it("create retry uses the same character, views and references without a second paid call",async()=>{
  const key=randomUUID();fail.result=true;
  expect((await POST(request(key,body))).status).toBe(500);
  const first=await getLocalDatabase().read(data=>({characters:data.characters.length,views:data.characterViews.length,references:data.referenceImages.length}));
  expect(first).toEqual({characters:1,views:3,references:3});
  fail.result=false;await expire();
  const response=await POST(request(key,body));expect(response.status).toBe(200);
  const result=await response.json();expect(result.angleCount).toBe(3);expect(result.id).toBe((await localLedger().existing("owner",key))?.id);
  expect(await getLocalDatabase().read(data=>({characters:data.characters.length,views:data.characterViews.length,references:data.referenceImages.length}))).toEqual(first);
  expect(paid).toBe(2);expect((await localLedger().existing("owner",key))?.state).toBe("succeeded");
});
it("front-only storage remains a successful zero-credit operation",async()=>{
  const key=randomUUID();const response=await POST(request(key,{...body,angles:[],sheet:false}));
  expect(response.status).toBe(200);expect((await response.json()).angleCount).toBe(1);
  const run=await localLedger().existing("owner",key);expect(run?.state).toBe("succeeded");expect(run?.consumed_units).toBe(0);expect(paid).toBe(0);
});
it("a sheet regeneration publishes a new run path and preserves replay identity",async()=>{
  const created=await (await POST(request(randomUUID(),body))).json();const key=randomUUID();
  const input={characterId:created.id,angle:"sheet",modelId:"gpt-image-2"};
  expect((await regenerate(request(key,input))).status).toBe(200);
  const run=await localLedger().existing("owner",key);
  const view=await getLocalDatabase().read(data=>data.characterViews.find(v=>v.characterId===created.id&&v.angle==="sheet"));
  expect(view?.path).toContain(`/${run?.id}/`);
  expect((await regenerate(request(key,input))).status).toBe(200);expect(paid).toBe(3);
});
it("active deletion is rejected before image files disappear",async()=>{
  const key=randomUUID();fail.settlement=true;
  const created=await (await POST(request(key,body))).json();
  const view=await getLocalDatabase().read(data=>data.characterViews.find(v=>v.characterId===created.id));
  const file=path.join(root,"characters",...view!.path.split("/"));
  expect((await DELETE(request(randomUUID(),{id:created.id},"DELETE"))).status).toBe(409);
  expect(await readFile(file)).toEqual(Buffer.from([1,2,3]));
});
it("duplicate angle input is rejected before any paid request",async()=>{
  expect((await POST(request(randomUUID(),{...body,angles:["left_45","left_45"]}))).status).toBe(400);expect(paid).toBe(0);
});
