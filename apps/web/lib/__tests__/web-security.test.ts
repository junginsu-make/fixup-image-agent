import { afterEach, expect, it, vi } from "vitest";
import { publicOrigin, safeNext, HOME_AFTER_LOGIN } from "../routes";
import { GET as ready } from "../../app/api/health/ready/route";
afterEach(()=>vi.unstubAllEnvs());
it("T22 ignores attacker host and protocol when generating production redirects",()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("NEXT_PUBLIC_SITE_URL","https://studio.example.com");
  expect(publicOrigin(new Headers({host:"evil.example","x-forwarded-host":"evil.example","x-forwarded-proto":"javascript"}),"http://localhost:3000")).toBe("https://studio.example.com");
});
it("T22 rejects backslashes, controls, nested encoding and normalized network paths",()=>{
  for(const next of ["/\\evil.example","/\tevil.example","/%5cevil.example","/%255cevil.example","/%2fevil.example","/a/..//evil.example","//evil.example","https://evil.example"])
    expect(safeNext(next),next).toBe(HOME_AFTER_LOGIN);
  expect(safeNext("/library?tab=images#recent")).toBe("/library?tab=images#recent");
});
it("T23 public readiness contains only overall status",async()=>{
  const result=await ready();const body=await result.json();
  expect(Object.keys(body).sort()).toEqual(["ok","status"]);
});
