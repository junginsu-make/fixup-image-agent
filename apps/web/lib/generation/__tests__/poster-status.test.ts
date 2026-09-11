import { describe,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
const mock=vi.hoisted(()=>({ lookup:vi.fn(),provider:vi.fn(),finalize:vi.fn() }));
vi.mock("../../membership/api",()=>({authenticateApiMember:async()=>({ok:true,member:{userId:"actor"}}),finalizeAiUsage:mock.finalize}));
vi.mock("../run-store",()=>({useDurableGeneration:()=>true,runForResource:mock.lookup}));
vi.mock("../../poster/stores",()=>({posterStoresForUser:()=>({images:{byProject:async()=>[]}})}));
vi.mock("../../poster/providers",()=>({createPosterFalClients:mock.provider,PosterProviderConfigurationError:class extends Error{}}));
import {POST} from "../../../app/api/poster/projects/[id]/status/route";
const id="60000000-0000-4000-8000-000000000001";
const call=(body:unknown)=>POST(new Request("http://localhost/status",{method:"POST",body:JSON.stringify(body)}),{params:Promise.resolve({id:"project"})});
describe("T07: poster status only reads a server-bound run",()=>{
  it("rejects client-supplied provider identities",async()=>{
    const response=await call({runId:id,endpoint:"injected",falRequestId:"other"});
    expect(response.status).toBeGreaterThanOrEqual(400);expect(mock.provider).not.toHaveBeenCalled();
  });
  it("uses actor, project and run together, without invoking provider or settlement",async()=>{
    mock.lookup.mockResolvedValue({id,state:"succeeded"});
    const response=await call({runId:id});expect(response.status).toBe(200);
    expect(mock.lookup).toHaveBeenCalledWith("actor","poster","project",id);
    expect(mock.provider).not.toHaveBeenCalled();expect(mock.finalize).not.toHaveBeenCalled();
    expect((await response.json()).done).toBe(true);
  });
  it("does not substitute another project or a missing run",async()=>{
    mock.lookup.mockResolvedValue(null);expect((await call({runId:id})).status).toBe(404);
  });
});
