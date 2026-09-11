import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GenerationRun } from "../types";
vi.mock("server-only", () => ({}));
import { readCachedResult, writeCachedResult } from "../result-cache";
let root: string; let parent: string;
const run = (epoch: number) => ({ id: "run", user_id: "owner", lease_epoch: epoch, checkpoint: {} } as GenerationRun);
beforeEach(async () => {
  parent = await realpath(tmpdir()); root = await mkdtemp(path.join(parent, "fixup-result-cache-"));
  vi.stubEnv("LOCAL_STORE", "1"); vi.stubEnv("LOCAL_STORE_ROOT", root);
});
afterEach(async () => {
  vi.unstubAllEnvs(); const target = await realpath(root);
  if (path.dirname(target) !== parent || !path.basename(target).startsWith("fixup-result-cache-")) throw new Error("Unexpected cleanup target");
  await rm(target, { recursive: true });
});
it("keeps raw provider evidence immutable under competing writes", async () => {
  const results = await Promise.allSettled([writeCachedResult(run(1), { v: 1 }, "attempt-provider"), writeCachedResult(run(1), { v: 2 }, "attempt-provider")]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const saved = await readCachedResult(run(1), "attempt-provider");
  expect([{ v: 1 }, { v: 2 }]).toContainEqual(saved);
  await expect(writeCachedResult(run(1), saved, "attempt-provider")).resolves.toBeDefined();
});
it.each([true, false])("old and new executors cannot overwrite each other's final result (old first=%s)", async oldFirst => {
  const old = () => writeCachedResult(run(1), { value: "late old failure" });
  const current = () => writeCachedResult(run(2), { value: "new success" });
  if (oldFirst) { await old(); await current(); } else { await current(); await old(); }
  expect(await readCachedResult(run(2))).toEqual({ value: "new success" });
});
