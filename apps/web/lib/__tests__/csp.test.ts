import { expect, it, vi } from "vitest";
import { cspReportPolicy, sanitizedCspReport } from "../security/csp";
import { POST } from "../../app/api/security/csp-report/route";
it("allows the actual Storage and Turnstile origins without eval or all HTTPS sources",()=>{
  const csp=cspReportPolicy("nonce","https://project.supabase.co");
  expect(csp).toContain("https://project.supabase.co");expect(csp).toContain("wss://project.supabase.co");
  expect(csp).toContain("https://challenges.cloudflare.com");expect(csp).not.toContain("unsafe-eval");expect(csp).not.toContain("https:;");
});
it("drops document paths, URL tokens, samples and credentials",()=>{
  expect(sanitizedCspReport({"csp-report":{"effective-directive":"img-src","blocked-uri":"https://user:secret@storage.example/object?token=secret#private","document-uri":"https://app/auth?token=secret","script-sample":"secret"}})).toEqual({directive:"img-src",blocked:"https://storage.example"});
});
it("bounds body size and unauthenticated report volume",async()=>{
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  try {
    expect((await POST(new Request("https://app/api/security/csp-report",{method:"POST",body:"x".repeat(16385)}))).status).toBe(400);
    let response:Response|undefined;
    for(let i=0;i<61;i++)response=await POST(new Request("https://app/api/security/csp-report",{method:"POST",body:"{}"}));
    expect(response?.status).toBe(429);expect(log).not.toHaveBeenCalled();
  }finally{log.mockRestore();}
});
