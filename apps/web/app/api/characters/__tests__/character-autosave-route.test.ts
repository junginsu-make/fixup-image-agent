import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **캐릭터도 만들어지면 저장된다 · 최고 관리자는 전부 본다**(2026-10-08 사용자 요청).
 *
 * 전에는 정면이 화면에만 있다가 「캐릭터 저장하기」를 눌러야 저장됐다. 정면에도 크레딧이
 * 나가는데, 누르지 않고 나가면 그림이 어디에도 안 남았다(운영 10-06 실제로 그랬다).
 * 다른 기능처럼 만들어지는 순간 저장한다. 다시 뽑으면 뽑을 때마다 저장한다(사용자 결정).
 */

vi.mock("server-only", () => ({}));

const calls = {
  create: [] as Array<Record<string, unknown>>,
  list: [] as Array<{ userId: string; options?: Record<string, unknown> }>,
  count: [] as Array<{ userId: string; options?: Record<string, unknown> }>,
  finalize: [] as Array<{ success: boolean; units: number }>,
};
let role: "member" | "admin" = "member";
let createResult: Record<string, unknown> | Error = { ok: true, id: "c1", name: "고양이", angleCount: 1 };
let candidates: Array<{ base64: string; mimeType: string }> = [{ base64: "AAAA", mimeType: "image/png" }];
let recentCharacters: number | Error = 0;
/** 진짜 PNG 머리 8바이트. 옛 저장 단계는 그림인지 바이트로 본다. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1", profile: { role } } }),
  reserveAiUsage: async () => ({ ok: true, userId: "u1", requestId: "r1" }),
  finalizeAiUsage: async (_r: unknown, success: boolean, units: number) => { calls.finalize.push({ success, units }); return undefined; },
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
vi.mock("../../../../lib/character-brief", () => ({
  prepareCharacterBrief: async () => ({ prompt: "A cat.", identity: "A cat with one head.", refined: true }),
}));
vi.mock("../../../../lib/characters", () => ({
  DEFAULT_CANDIDATES: 1,
  MIN_CANDIDATES: 1,
  MAX_CANDIDATES: 3,
  characterCreditCost: () => 1,
  listCharacters: async (userId: string, _team: unknown, options?: Record<string, unknown>) => {
    calls.list.push({ userId, options });
    return [];
  },
  deleteCharacter: async () => ({ ok: true }),
  countCharacters: async (userId: string, _team: unknown, options?: Record<string, unknown>) => {
    calls.count.push({ userId, options });
    return 7;
  },
  countRecentCharacters: async () => {
    if (recentCharacters instanceof Error) throw recentCharacters;
    return recentCharacters;
  },
  generateCandidates: async () => ({ model: "nano-banana-pro", candidates, requested: 1 }),
  createCharacter: async (input: Record<string, unknown>) => {
    calls.create.push(input);
    if (createResult instanceof Error) throw createResult;
    return createResult;
  },
}));

const { GET, POST } = await import("../route");

const post = (body: Record<string, unknown>) =>
  POST(new Request("http://local/api/characters", { method: "POST", body: JSON.stringify(body) }));
const 정면 = { step: "candidates", description: "고양이인데 3등신", kind: "character", look: "3d", name: "냥이" };

beforeEach(() => {
  calls.create.length = 0;
  calls.list.length = 0;
  calls.count.length = 0;
  calls.finalize.length = 0;
  role = "member";
  createResult = { ok: true, id: "c1", name: "냥이", angleCount: 1 };
  candidates = [{ base64: "AAAA", mimeType: "image/png" }];
  recentCharacters = 0;
});

describe("정면이 나오면 저장한다", () => {
  it("만든 그 정면으로 캐릭터를 저장한다 — 화면이 보낸 그림을 기다리지 않는다", async () => {
    await post(정면);
    expect(calls.create).toHaveLength(1);
    expect(calls.create[0]).toMatchObject({
      userId: "u1", name: "냥이", description: 정면.description, kind: "character", look: "3d",
      angles: [], sheet: false, chosenBase64: "AAAA", chosenMimeType: "image/png",
      identityPrompt: "A cat with one head.",
    });
  });

  it("저장한 캐릭터를 화면에 알린다", async () => {
    const body = await (await post(정면)).json();
    expect(body.character).toEqual({ id: "c1", name: "냥이" });
    expect(body.candidates).toHaveLength(1);
  });

  it("이름이 없으면 묘사로 짓는다", async () => {
    await post({ ...정면, name: "  " });
    expect(calls.create[0]!.name).toBe(정면.description);
  });

  /** 저장이 실패해도 돈을 낸 정면은 돌려준다. 화면이 「다시 저장하기」로 살린다. */
  it("저장이 실패해도 정면은 주고 실패를 알린다", async () => {
    createResult = { ok: false, message: "저장소 오류 https://secret" };
    const body = await (await post(정면)).json();
    expect(body.ok).toBe(true);
    expect(body.candidates).toHaveLength(1);
    expect(body.character).toBeUndefined();
    expect(body.saveError).toBe("정면은 만들었지만 저장하지 못했습니다. 「다시 저장하기」를 눌러 주세요.");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("저장이 터져도 정면은 주고 차감은 한 번만 확정한다", async () => {
    createResult = new Error("boom");
    const body = await (await post(정면)).json();
    expect(body.ok).toBe(true);
    expect(body.saveError).toBeTruthy();
    // 정면 값은 그대로 한 번만 확정한다. 저장 실패가 차감을 되돌리거나 두 번 잡으면 안 된다.
    expect(calls.finalize).toHaveLength(1);
    expect(calls.finalize[0]!.success).toBe(true);
    expect(calls.finalize[0]!.units).toBeGreaterThan(0);
  });

  it("정면을 못 만들었으면 저장하지 않는다", async () => {
    candidates = [];
    await post(정면);
    expect(calls.create).toEqual([]);
  });
});

/** **최고 관리자는 모든 회원의 캐릭터를 본다**(사용자가 여러 번 말함). 라이브러리가 `scope=all` 로 묻는다. */
describe("목록 범위", () => {
  const get = (query = "") => GET(new Request(`http://local/api/characters${query}`));

  it("관리자가 전체를 달라고 하면 전체를 준다", async () => {
    role = "admin";
    await get("?scope=all");
    expect(calls.list[0]!.options).toMatchObject({ allMembers: true });
  });

  it("회원이 전체를 달라고 해도 자기 것만 준다", async () => {
    await get("?scope=all");
    expect(calls.list[0]!.options?.allMembers).not.toBe(true);
  });

  /** 만들기 화면·불러오기 창은 범위를 안 보낸다. 관리자도 자기 것만 — 남의 캐릭터를 잘못 불러 쓰지 않게. */
  it("범위를 안 보내면 관리자도 자기 것만", async () => {
    role = "admin";
    await get();
    expect(calls.list[0]!.options?.allMembers).not.toBe(true);
  });
});

/** 참고 이미지 창고에 못 넣었으면 조용히 넘어가지 않는다 — 옛 저장 단계가 그랬듯 알린다. */
describe("자동 저장 — 참고 이미지 실패", () => {
  it("저장은 됐지만 참고 이미지에 못 넣었으면 그 말을 함께 준다", async () => {
    createResult = { ok: true, id: "c1", name: "냥이", angleCount: 1, referenceIssue: "참고 이미지에 넣지 못했습니다." };
    const body = await (await post(정면)).json();
    expect(body.character).toEqual({ id: "c1", name: "냥이" });
    expect(body.referenceIssue).toBe("참고 이미지에 넣지 못했습니다.");
  });
});

/**
 * **옛 저장 단계(`create`)는 이제 「다시 저장하기」의 길이다**(2026-10-08 보안 리뷰 MEDIUM).
 * 각도 없이 부르면 0크레딧이라 장부가 막지 않는다. 그림이 아닌 것을 받지 않고, 시간당 상한을 둔다.
 */
describe("옛 저장 단계 — 각도 없이", () => {
  const 저장 = { step: "create", description: "고양이", kind: "character", look: "3d", angles: [], sheet: false };

  it("그림이 아닌 바이트는 받지 않는다", async () => {
    const response = await post({ ...저장, chosenBase64: Buffer.from("<html>").toString("base64"), chosenMimeType: "text/html" });
    expect(response.status).toBe(400);
    expect(calls.create).toEqual([]);
  });

  it("PNG 는 받는다", async () => {
    const response = await post({ ...저장, chosenBase64: PNG, chosenMimeType: "image/png" });
    expect(response.status).toBe(200);
    expect(calls.create).toHaveLength(1);
  });

  it("한 시간 상한을 넘으면 저장하지 않는다", async () => {
    recentCharacters = 30;
    const response = await post({ ...저장, chosenBase64: PNG, chosenMimeType: "image/png" });
    expect(response.status).toBe(429);
    expect(calls.create).toEqual([]);
  });

  /** 딱지를 믿지 않는다 — 바이트로 판정한 형식으로 저장한다(재리뷰 LOW). */
  it("저장 형식은 화면이 보낸 딱지가 아니라 바이트가 정한다", async () => {
    await post({ ...저장, chosenBase64: PNG, chosenMimeType: "text/html" });
    expect(calls.create[0]!.chosenMimeType).toBe("image/png");
  });

  /** 못 세면 저장하지 않는다. 다만 「30개 상한」은 사실이 아니므로 다른 말을 한다(재리뷰 LOW). */
  it("저장 수를 못 세면 저장하지 않고, 상한 문구 대신 잠시 뒤 다시를 말한다", async () => {
    recentCharacters = new Error("db down");
    const response = await post({ ...저장, chosenBase64: PNG, chosenMimeType: "image/png" });
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(calls.create).toEqual([]);
    expect(body.message).toBe("지금은 저장할 수 없습니다. 잠시 뒤 다시 눌러 주세요.");
  });

  /** 각도를 함께 만들면 그 장 값이 나가 장부가 막는다. 상한은 공짜 길에만 건다. */
  it("각도를 함께 만드는 저장은 상한을 보지 않는다", async () => {
    recentCharacters = 30;
    const response = await post({ ...저장, angles: ["back"], chosenBase64: PNG, chosenMimeType: "image/png" });
    expect(response.status).toBe(200);
  });
});

/**
 * **개수만**(2026-10-08 사용자 요청 — 「캐릭터」 단추에 숫자). 목록을 통째로 읽으면 그림 주소까지
 * 서명해 라이브러리를 열 때마다 무겁다. 숫자만 센다. 범위 규칙은 목록과 같다.
 */
describe("개수만", () => {
  const get = (query: string) => GET(new Request(`http://local/api/characters${query}`));

  it("목록을 읽지 않고 숫자만 준다", async () => {
    const body = await (await get("?count=1")).json();
    expect(body).toEqual({ ok: true, count: 7 });
    expect(calls.list).toEqual([]);
  });

  it("관리자가 전체를 달라고 하면 전체를 센다", async () => {
    role = "admin";
    await get("?scope=all&count=1");
    expect(calls.count[0]!.options).toMatchObject({ allMembers: true });
  });

  it("회원은 전체를 달라고 해도 자기 것만 센다", async () => {
    await get("?scope=all&count=1");
    expect(calls.count[0]!.options?.allMembers).not.toBe(true);
  });
});
