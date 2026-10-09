import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자는 남의 캐릭터도 지운다**(2026-10-09 사용자 — 9843ohs·ai.dev 는 모든 결과물을 보고 지울 수 있어야 한다).
 *
 * 캐릭터 지우기는 주인 폴더·주인 줄을 기준으로 지운다(`deleteCharacter(userId, id)`). 관리자 id 로 부르면 한 줄도
 * 못 지우고 「지웠다」만 뜬다. 그래서 관리자면 **서버가 캐릭터의 주인을 찾아** 그 주인으로 지운다 — 화면이 보낸
 * 주인 값을 믿지 않는다. 회원은 지금처럼 자기 것만.
 */
vi.mock("server-only", () => ({}));

let role: "member" | "admin" = "member";
let owner: string | null = "u9";
let failDelete = false;
/** 회원의 지우기가 고칠 줄을 찾는가. 없으면(남의 것·이미 지운 것) 못 찾았다고 답한다. */
let softFound = true;
let softFails = false;
const deleted: Array<{ userId: string; id: string }> = [];
const softDeleted: Array<{ userId: string; id: string }> = [];
const C = "11111111-1111-4111-8111-111111111111";

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1", profile: { role } } }),
  reserveAiUsage: async () => ({ ok: true }),
  finalizeAiUsage: async () => undefined,
}));
vi.mock("../../../../lib/membership/credit-ledger", () => ({ creditImagePlan: () => ({}), markCreditStarted: async () => undefined }));
vi.mock("../../../../lib/membership/image-sizes", () => ({ pdpCreditSize: () => "standard" }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/llm/meter", () => ({ withLlmMeter: (run: () => unknown) => run(), llmSettleCost: () => ({}) }));
vi.mock("../../../../lib/character-brief", () => ({ prepareCharacterBrief: async () => ({}) }));
vi.mock("../../../../lib/characters", () => ({
  DEFAULT_CANDIDATES: 1, MIN_CANDIDATES: 1, MAX_CANDIDATES: 3,
  characterCreditCost: () => 1,
  listCharacters: async () => [],
  characterOwnerOf: async () => owner,
  deleteCharacter: async (userId: string, id: string) => {
    deleted.push({ userId, id });
    return failDelete ? { ok: false, message: 'column characters.x does not exist' } : { ok: true };
  },
}));

vi.mock("../../../../lib/character-soft-delete", () => ({
  softDeleteCharacter: async (userId: string, id: string) => {
    if (softFails) return { ok: false, message: "삭제하지 못했습니다." };
    if (!softFound) return { ok: false, notFound: true, message: "캐릭터를 찾지 못했습니다." };
    softDeleted.push({ userId, id });
    return { ok: true };
  },
}));

const { DELETE } = await import("../route");
const remove = (body: Record<string, unknown>) =>
  DELETE(new Request("http://local/api/characters", { method: "DELETE", body: JSON.stringify(body) }));

beforeEach(() => {
  role = "member";
  owner = "u9";
  failDelete = false;
  softFound = true;
  softFails = false;
  deleted.length = 0;
  softDeleted.length = 0;
});

describe("캐릭터 지우기", () => {
  /** 회원이 지우면 보관한다(2026-10-08 사용자 결정 — 계획 2단계). 완전 삭제는 관리자만. */
  it("회원은 자기 것을 보관으로 지운다 — 주인을 찾지 않고 완전 삭제하지 않는다", async () => {
    expect((await remove({ id: C })).status).toBe(200);
    expect(softDeleted).toEqual([{ userId: "u1", id: C }]);
    expect(deleted).toEqual([]);
  });

  it("회원이 주인 값을 보내도 무시한다", async () => {
    await remove({ id: C, owner: "u9" });
    expect(softDeleted).toEqual([{ userId: "u1", id: C }]);
  });

  it("회원이 남의 것·이미 지운 것을 지우면 404", async () => {
    softFound = false;
    expect((await remove({ id: C })).status).toBe(404);
    expect(deleted).toEqual([]);
  });

  it("회원의 지우기가 실패하면 500 — 일반 문구", async () => {
    softFails = true;
    const response = await remove({ id: C });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: "삭제하지 못했습니다." });
  });

  it("관리자는 남의 캐릭터를 그 주인으로 완전히 지운다", async () => {
    role = "admin";
    expect((await remove({ id: C })).status).toBe(200);
    expect(deleted).toEqual([{ userId: "u9", id: C }]);
    expect(softDeleted).toEqual([]);
  });

  it("관리자가 없는 캐릭터를 지우면 404 — 아무것도 지우지 않는다", async () => {
    role = "admin";
    owner = null;
    expect((await remove({ id: C })).status).toBe(404);
    expect(deleted).toEqual([]);
  });
});

describe("캐릭터 지우기 — 경계", () => {
  it("형식이 틀린 id 는 400 — DB 에 묻지도 지우지도 않는다", async () => {
    role = "admin";
    expect((await remove({ id: "abc" })).status).toBe(400);
    expect(deleted).toEqual([]);
  });

  it("지우다 실패하면 DB 원문 대신 일반 문구", async () => {
    role = "admin";
    failDelete = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await remove({ id: C });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: "삭제하지 못했습니다." });
  });
});
