import { afterEach, expect, it, vi } from "vitest";
vi.mock("../supabase/server",()=>({createSupabaseServerClient:async()=>({auth:{exchangeCodeForSession:async()=>({error:null}),verifyOtp:async()=>({error:null})}})}));
import { GET } from "../../app/auth/confirm/route";
afterEach(()=>vi.unstubAllEnvs());
it("T22 applies the same navigation rules after auth query decoding",async()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("NEXT_PUBLIC_SITE_URL","https://studio.example.com");
  for(const next of ["/\\evil.example","/%255cevil.example","/a/..//evil.example","//evil.example"]){
    const response=await GET(new Request(`http://localhost:3000/auth/confirm?code=fake&next=${encodeURIComponent(next)}`,{headers:{host:"evil.example","x-forwarded-host":"evil.example","x-forwarded-proto":"http"}}));
    expect(response.headers.get("location")).toBe("https://studio.example.com/access");
  }
  const response=await GET(new Request("http://localhost:3000/auth/confirm?code=fake&next=%2Freset-password"));
  expect(response.headers.get("location")).toBe("https://studio.example.com/reset-password");
});
