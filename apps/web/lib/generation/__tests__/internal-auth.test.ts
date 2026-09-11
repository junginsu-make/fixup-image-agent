import { expect, it } from "vitest";
import { authorizedGenerationExecutor } from "../internal-auth";
const secret="s".repeat(64);
const headers={host:"127.0.0.1:3000",authorization:`Bearer ${secret}`,"x-generation-release":"release","x-generation-protocol":"2"};
const request=(extra:Record<string,string>={},url="http://127.0.0.1:3000/api/internal/generation/tick")=>new Request(url,{headers:{...headers,...extra}});
it("accepts the matching internal helper and rejects external, proxied or mismatched requests",()=>{
  expect(authorizedGenerationExecutor(request(),secret,"release")).toBe(true);
  expect(authorizedGenerationExecutor(request({},"https://public.example/api/internal/generation/tick"),secret,"release")).toBe(false);
  for(const h of ["forwarded","x-forwarded-for","x-forwarded-host","x-forwarded-proto"])
    expect(authorizedGenerationExecutor(request({[h]:"attacker"}),secret,"release")).toBe(false);
  expect(authorizedGenerationExecutor(request({authorization:"Bearer wrong"}),secret,"release")).toBe(false);
  expect(authorizedGenerationExecutor(request(),secret,"old-release")).toBe(false);
  expect(authorizedGenerationExecutor(request(),undefined,"release")).toBe(false);
});
