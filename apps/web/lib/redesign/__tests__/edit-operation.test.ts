import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({ authenticateApiMember: async () => ({ ok: true, member: { userId: "owner" } }) }));
import { durableRedesignEdit } from "../edit-operation";
import { localLedger } from "../../generation/local-ledger";
let root: string; let parent: string; let paid: number; let quality: string | undefined;
beforeEach(async () => {
  parent = await realpath(tmpdir()); root = await mkdtemp(path.join(parent, "fixup-edit-test-"));
  vi.stubEnv("LOCAL_STORE", "1"); vi.stubEnv("LOCAL_STORE_ROOT", root); vi.stubEnv("GENERATION_EXECUTION_V2", "1");
  vi.stubEnv("OPENAI_API_KEY", "fake"); vi.stubEnv("GOOGLE_API_KEY", "fake");
  paid = 0; quality = undefined;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    paid++;
    if (url === "https://api.openai.com/v1/images/edits") {
      quality = String((init.body as FormData).get("quality"));
      expect((init.body as FormData).get("size")).toBe("1152x2048");
      return Response.json({ data: [{ b64_json: "AQID" }] });
    }
    if (url.startsWith("https://generativelanguage.googleapis.com/")) return Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: "AQID", mimeType: "image/png" } }] } }] });
    throw new Error("Unexpected network request");
  });
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  const target = await realpath(root);
  if (path.dirname(target) !== parent || !path.basename(target).startsWith("fixup-edit-test-")) throw new Error("Unexpected cleanup target");
  await rm(target, { recursive: true });
});
it.each([["openai", 1], ["google", 3]] as const)("T21: %s edit keeps its actual quality and settles %i credits only once", async (model, units) => {
  const key = randomUUID();
  const request = () => new Request("https://example.invalid/api/redesign/edit-section", { method: "POST",
    headers: { "x-generation-protocol": "2", "x-idempotency-key": key },
    body: JSON.stringify({ model, imageUrl: "data:image/png;base64,AQID", request: "change background" }),
  });
  const response = await durableRedesignEdit(request());
  expect(response.status).toBe(200);
  const output = await response.json();
  expect(output.imageUrl).toBe("data:image/png;base64,AQID");
  const run = await localLedger().existing("owner", key);
  expect(run?.state).toBe("succeeded"); expect(run?.consumed_units).toBe(units);
  expect(await (await durableRedesignEdit(request())).json()).toEqual(output);
  expect(paid).toBe(1);
  if (model === "openai") expect(quality).toBe("low");
});
