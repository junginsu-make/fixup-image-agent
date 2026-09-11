import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ provider: vi.fn(), writer: vi.fn() }));
vi.mock("../../membership/api", () => ({ authenticateApiMember: async () => ({ ok: true, member: { userId: "viewer", profile: {} } }), reserveAiUsage: calls.provider, finalizeAiUsage: vi.fn() }));
vi.mock("../ownership", () => {
  class Denied extends Error {}
  return { assertProjectWrite: async () => { throw new Denied(); }, projectWriteDeniedResponse: (e: unknown) => e instanceof Denied ? Response.json({ok:false},{status:403}) : undefined };
});
vi.mock("../../sns-flow-store", () => ({ snsFlowStoreForUser: async () => ({ get: async () => undefined, save: calls.writer }), snsWriteDenied: () => undefined }));
vi.mock("../../poster/stores", () => ({ posterStoresForUser: () => ({ projects: { get: async () => undefined, update: calls.writer } }) }));

describe("T20: every paid project command checks ownership before work", () => {
  for (const kind of ["sns", "poster"] as const) {
    for (const operation of kind === "sns" ? ["generate", "plan", "caption", "stop"] : ["generate", "plan", "review"]) {
      it(`${kind}/${operation} rejects a shared read-only project`, async () => {
        const route = kind === "sns"
          ? await import(`../../../app/api/sns/projects/[id]/${operation}/route.ts`)
          : await import(`../../../app/api/poster/projects/[id]/${operation}/route.ts`);
        const response = await route.POST(new Request("http://localhost/test", {method:"POST"}), {params:Promise.resolve({id:"project"})});
        expect(response.status).toBe(403);
        expect(calls.provider).not.toHaveBeenCalled();
        expect(calls.writer).not.toHaveBeenCalled();
      });
    }
  }
});
