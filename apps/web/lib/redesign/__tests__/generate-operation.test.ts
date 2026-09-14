import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({ authenticateApiMember: async () => ({ ok: true, member: { userId: "owner" } }) }));
vi.mock("../../fal/upload", () => ({ createFalUploader: () => ({ uploadReference: async () => "https://example.invalid/reference" }) }));
import { durableRedesignGenerate } from "../generate-operation";
import { localLedger } from "../../generation/local-ledger";
let root: string; let parent: string; let analyses: number; let images: number; let failSecond: boolean;
beforeEach(async () => {
  parent = await realpath(tmpdir()); root = await mkdtemp(path.join(parent, "fixup-redesign-test-"));
  vi.stubEnv("LOCAL_STORE", "1"); vi.stubEnv("LOCAL_STORE_ROOT", root); vi.stubEnv("GENERATION_EXECUTION_V2", "1");
  vi.stubEnv("OPENAI_API_KEY", "fake"); vi.stubEnv("GOOGLE_API_KEY", "fake"); vi.stubEnv("DATABASE_URL", "");
  analyses = 0; images = 0; failSecond = false;
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url === "https://api.openai.com/v1/responses") { analyses++; return Response.json({ output_text: '{"product_inferred":{"name":"test"}}', usage: { input_tokens: 100, output_tokens: 10 } }); }
    if (url.includes("gemini-3.1-pro-preview")) { analyses++; return Response.json({ candidates: [{ content: { parts: [{ text: '{"product_inferred":{"name":"test"}}' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } }); }
    if (url === "https://example.invalid/output.png") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
    if (url.startsWith("https://fal.run/") || url === "https://api.openai.com/v1/images/edits" || url.includes("gemini-3.1-flash-image-preview")) {
      images++;
      if (failSecond && images === 2) return Response.json({ error: { message: "rate limit" } }, { status: 429 });
      if (url.startsWith("https://fal.run/")) return Response.json({ images: [{ url: "https://example.invalid/output.png" }] });
      if (url.includes("googleapis")) return Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: "AQID", mimeType: "image/png" } }] } }] });
      expect((init!.body as FormData).get("quality")).toBe("high");
      return Response.json({ data: [{ b64_json: "AQID" }] });
    }
    throw new Error("Unexpected network request");
  });
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  const target = await realpath(root);
  if (path.dirname(target) !== parent || !path.basename(target).startsWith("fixup-redesign-test-")) throw new Error("Unexpected cleanup target");
  await rm(target, { recursive: true });
});
function request(key: string, model: string) {
  const form = new FormData(); form.set("model", model); form.set("count", "2"); form.set("request", "preserve product");
  form.set("files", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "source.png");
  return new Request("https://example.invalid/api/redesign/generate", { method: "POST", headers: { "x-generation-protocol": "2", "x-idempotency-key": key }, body: form });
}
it.each([["openai", false, 9], ["google", false, 6], ["openai", true, 7], ["google", true, 7]] as const)("records %s / fal=%s actual provider costs and replays without extra calls", async (model, fal, units) => {
  vi.stubEnv("FAL_KEY", fal ? "fake" : "");
  const key = randomUUID(); const response = await durableRedesignGenerate(request(key, model));
  expect(response.status).toBe(200);
  const output = await response.json(); expect(output.project.sections).toHaveLength(2);
  expect((await localLedger().existing("owner", key))?.consumed_units).toBe(units);
  expect(await (await durableRedesignGenerate(request(key, model))).json()).toEqual(output);
  expect(analyses).toBe(1); expect(images).toBe(2);
});
it("preserves partial generation and charges only the delivered section", async () => {
  vi.stubEnv("FAL_KEY", "fake"); failSecond = true;
  const key = randomUUID(); const response = await durableRedesignGenerate(request(key, "openai"));
  expect(response.status).toBe(200);
  const output = await response.json(); expect(output.project.sections).toHaveLength(1); expect(output.project.failedSections).toHaveLength(1);
  expect((await localLedger().existing("owner", key))?.consumed_units).toBe(4);
  expect(images).toBe(2);
});
