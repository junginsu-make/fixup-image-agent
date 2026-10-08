import { describe, expect, it, vi } from "vitest";

/** 캐릭터 GET 이 주는 모델 목록 — 화면이 고르는 보이는 셋만(Task 7). */

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  reserveAiUsage: async () => ({ ok: true }),
  finalizeAiUsage: async () => undefined,
}));
vi.mock("../../../../lib/membership/credit-ledger", () => ({
  creditImagePlan: () => ({}),
  markCreditStarted: async () => undefined,
}));
vi.mock("../../../../lib/membership/image-sizes", () => ({ pdpCreditSize: () => "standard" }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (run: () => unknown) => run(),
  llmSettleCost: () => ({ model: "", billableImages: 0, llmUsd: 0 }),
}));
vi.mock("../../../../lib/character-brief", () => ({ prepareCharacterBrief: async () => ({}) }));
vi.mock("../../../../lib/characters", () => ({
  DEFAULT_CANDIDATES: 1,
  MIN_CANDIDATES: 1,
  MAX_CANDIDATES: 3,
  characterCreditCost: () => 1,
  listCharacters: async () => [],
  countCharacters: async () => 0,
  deleteCharacter: async () => ({ ok: true }),
  countRecentCharacters: async () => 0,
  generateCandidates: async () => ({}),
  createCharacter: async () => ({}),
}));

const { GET } = await import("../route");

describe("캐릭터 GET 모델 목록", () => {
  it("보이는 셋만 주고 시험 표시는 없다", async () => {
    const body = await (await GET(new Request("http://local/api/characters"))).json();
    expect(body.models.map((m: { label: string }) => m.label)).toEqual(["표준형", "디테일형", "속도형"]);
    expect(body.models.every((m: Record<string, unknown>) => !("untested" in m))).toBe(true);
  });
});
