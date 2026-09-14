import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("next/headers",()=>({headers:async()=>new Headers({"x-nonce":"trusted-test-nonce-123456789"})}));
vi.mock("@fixup/ui",()=>({ThemeProvider:()=>null,Toaster:()=>null}));
vi.mock("../../app/_components/image-viewer",()=>({ImageViewerHost:()=>null}));
import RootLayout from "../../app/layout";
import { middleware } from "../../middleware";
import { costLabDocument } from "../admin/cost-lab";
afterEach(()=>vi.unstubAllEnvs());
it("T24 production sends an enforced policy and replaces client-supplied nonce",async()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("CSP_MODE","");
  const response=await middleware(new NextRequest("http://localhost:3000/api/health",{headers:{"x-nonce":"attacker","content-security-policy":"script-src *"}}));
  const policy=response.headers.get("content-security-policy");
  expect(policy).toContain("script-src 'self' 'nonce-");expect(policy).not.toContain("attacker");
  expect(response.headers.has("content-security-policy-report-only")).toBe(false);
});
it("T24 the theme bootstrap receives the request nonce and opts rendering into request scope",async()=>{
  const tree=await RootLayout({children:null});
  expect(tree.props.children.props.children.props.nonce).toBe("trusted-test-nonce-123456789");
});
it("T24 trusted cost lab scripts, including the injected theme script, receive the same nonce",()=>{
  const html=costLabDocument('<html><head></head><body><script id="calc">window.ready=true</script></body></html>',"","","trusted-test-nonce-123456789");
  const scripts=[...html.matchAll(/<script\b[^>]*>/g)];
  expect(scripts.length).toBe(2);
  for(const script of scripts)expect(script[0]).toContain('nonce="trusted-test-nonce-123456789"');
});
