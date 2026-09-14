import { afterEach, expect, it, vi } from "vitest";
import type { GenerationRun } from "../types";
vi.mock("server-only",()=>({}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("keeps concurrent execution headers separate and sends them only to PostgREST",async()=>{
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","fake");vi.stubEnv("SUPABASE_SECRET_KEY","fake");
  const calls:Array<{url:string;headers:Headers}>=[];
  vi.stubGlobal("fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    calls.push({url:String(input),headers:new Headers(init?.headers)});
    return Response.json([]);
  });
  const {createSupabaseAdminClient}=await import("../../supabase/admin");
  const {withGenerationFence}=await import("../fence-context");
  const admin=createSupabaseAdminClient();
  const run=(id:string)=>({id,user_id:"owner",lease_token:`lease-${id}`} as GenerationRun);
  await Promise.all(["first","second"].map(id=>withGenerationFence(run(id),async()=>{
    await admin.from("characters").update({name:id}).eq("id",id);
  })));
  expect(calls.map(c=>c.headers.get("x-generation-run")).sort()).toEqual(["first","second"]);
  for(const call of calls)expect(call.headers.get("x-generation-lease")).toBe(`lease-${call.headers.get("x-generation-run")}`);
  await withGenerationFence(run("storage"),async()=>{await admin.storage.from("characters").upload("owner/run/image.png",new Uint8Array([1]));});
  expect(calls.at(-1)!.headers.has("x-generation-lease")).toBe(false);
  await admin.from("characters").select("id");
  expect(calls.at(-1)!.headers.has("x-generation-run")).toBe(false);
});
