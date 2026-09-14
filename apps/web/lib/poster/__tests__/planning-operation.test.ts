import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), owner: vi.fn(), admit: vi.fn(), grammar: vi.fn(), people: vi.fn(), plan: vi.fn(), update: vi.fn() }));
vi.mock("../../membership/api", () => ({ authenticateApiMember: mocks.auth }));
vi.mock("../../generation/ownership", () => ({ assertProjectWrite: mocks.owner, projectWriteDeniedResponse: () => undefined }));
vi.mock("../../generation/llm-operation", () => ({ runLlmOperation: mocks.admit }));
vi.mock("@fixup/poster-core", async () => ({ ...await vi.importActual("@fixup/poster-core"), readReferenceGrammar: mocks.grammar, readPeople: mocks.people, planPoster: mocks.plan }));
vi.mock("../providers", () => ({ createPosterGrammarReader: () => ({}), createPosterPeopleReader: () => ({}), createPosterPlanningProviders: () => ({ primary: {}, backup: {} }) }));
vi.mock("../stores", () => ({ posterStoresForUser: () => ({
  projects: { get: async () => ({ id: "project", ratio: "1:1", updatedAt: "original-revision", data: { instruction: "hello", referenceIds: ["ref"], preservedIds: [], slots: {} } }), update: mocks.update },
  references: { byIds: async (ids: string[]) => ids.map(id => ({ id, url: "https://example.invalid/image" })) },
}) }));
import { durablePosterPlanning } from "../planning-operation";
const request = () => new Request("https://example.invalid/api/plan", { method: "POST" });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, member: { userId: "owner" } });
  mocks.grammar.mockResolvedValue({ grammars: {}, summaries: {}, issues: [] });
  mocks.people.mockResolvedValue({ people: {}, issues: [] });
  mocks.plan.mockResolvedValue({ slots: { headline: "hello" }, issues: [] });
  mocks.update.mockResolvedValue({ id: "project" });
  mocks.admit.mockImplementation(async (_r, _u, _options, call) => call());
});
it("admission precedes every paid grammar/people/planning call and preserves nonzero credit policy", async () => {
  mocks.admit.mockImplementation(async (_r, _u, options, call) => {
    expect(mocks.owner).toHaveBeenCalledWith("owner", "poster", "project");
    expect(mocks.grammar).not.toHaveBeenCalled(); expect(mocks.people).not.toHaveBeenCalled(); expect(mocks.plan).not.toHaveBeenCalled();
    expect(options.operation).toBe("poster_plan"); expect(options.units).toBeGreaterThan(0);
    return call();
  });
  expect((await durablePosterPlanning(request(), "project")).status).toBe(200);
  expect(mocks.update.mock.calls[0][2]).toBe("original-revision");
});
it("closed admission performs no paid reference reads", async () => {
  mocks.admit.mockRejectedValue(new Error("admission_closed"));
  expect((await durablePosterPlanning(request(), "project")).status).toBe(503);
  expect(mocks.grammar).not.toHaveBeenCalled(); expect(mocks.people).not.toHaveBeenCalled(); expect(mocks.plan).not.toHaveBeenCalled();
});
it("uses the original cached revision when an earlier request is replayed", async () => {
  mocks.admit.mockResolvedValue({ baseRevision: "older-cached-revision", slots: {}, issues: [] });
  mocks.update.mockRejectedValue(new Error("draft_conflict"));
  expect((await durablePosterPlanning(request(), "project")).status).toBe(409);
  expect(mocks.update.mock.calls[0][2]).toBe("older-cached-revision");
  expect(mocks.plan).not.toHaveBeenCalled();
});
