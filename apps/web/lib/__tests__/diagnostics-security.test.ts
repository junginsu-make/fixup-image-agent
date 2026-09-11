import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn()}));
vi.mock("../membership/api",()=>({authenticateApiAdmin:mocks.auth}));
vi.mock("../supabase/admin",()=>({createSupabaseAdminClient:mocks.admin}));
import { GET } from "../../app/api/admin/diagnostics/route";
it("T23 checks admin access before reading configuration or execution data",async()=>{
  for(const status of [401,403]){
    mocks.auth.mockResolvedValue({ok:false,response:new Response(null,{status})});
    expect((await GET()).status).toBe(status);
  }
  expect(mocks.admin).not.toHaveBeenCalled();
});
