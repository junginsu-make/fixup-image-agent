import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 라우트가 **정리한 말로 그리고, 정리한 정체성을 저장하는가.**
 * 그림·DB·LLM 은 전부 가짜다. 라우트의 연결만 본다.
 */

vi.mock("server-only", () => ({}));

const calls = {
  brief: [] as unknown[],
  candidates: [] as Array<Record<string, unknown>>,
  create: [] as Array<Record<string, unknown>>,
  reserve: 0,
};

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  reserveAiUsage: async () => { calls.reserve += 1; return { ok: true, userId: "u1", requestId: "r1" }; },
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
  llmSettleCost: () => ({ model: "", billableImages: 0, llmUsd: 0.002 }),
}));
vi.mock("../../../../lib/character-brief", () => ({
  prepareCharacterBrief: async (input: unknown) => {
    calls.brief.push(input);
    return { prompt: "A cat with one head. Smiling.", identity: "A cat with one head.", refined: true };
  },
}));
vi.mock("../../../../lib/characters", () => ({
  DEFAULT_CANDIDATES: 1,
  MIN_CANDIDATES: 1,
  MAX_CANDIDATES: 3,
  characterCreditCost: () => 1,
  listCharacters: async () => [],
  deleteCharacter: async () => ({ ok: true }),
  generateCandidates: async (input: Record<string, unknown>) => {
    calls.candidates.push(input);
    return { model: "nano-banana-pro", candidates: [{ base64: "AAAA", mimeType: "image/png" }], requested: 1 };
  },
  createCharacter: async (input: Record<string, unknown>) => {
    calls.create.push(input);
    return { ok: true, id: "c1", angleCount: 1 };
  },
}));

const { POST } = await import("../route");

function post(body: Record<string, unknown>) {
  return POST(new Request("http://local/api/characters", { method: "POST", body: JSON.stringify(body) }));
}

const 기본 = { description: "고양이인데 3등신", kind: "character", look: "3d" };

beforeEach(() => {
  calls.brief.length = 0;
  calls.candidates.length = 0;
  calls.create.length = 0;
  calls.reserve = 0;
});

describe("정면 만들기", () => {
  it("정리한 말로 그리고, 정리한 정체성을 돌려준다", async () => {
    const response = await post({ ...기본, step: "candidates" });
    const body = await response.json();

    expect(calls.brief[0]).toEqual({
      description: 기본.description, kind: "character", look: "3d",
      referenceRole: undefined, hasOwnCharacter: false,
    });
    expect(calls.candidates[0]!.description).toBe("A cat with one head. Smiling.");
    expect(body.brief).toEqual({ identity: "A cat with one head.", refined: true });
  });
});

describe("저장", () => {
  const 저장 = { ...기본, step: "create", chosenBase64: "AAAA", chosenMimeType: "image/png", angles: [] };

  it("화면이 보낸 정체성을 그대로 저장한다 — 다시 정리하지 않는다", async () => {
    await post({ ...저장, identityPrompt: "A cat with one head." });
    expect(calls.brief).toHaveLength(0);
    expect(calls.create[0]!.identityPrompt).toBe("A cat with one head.");
    expect(calls.create[0]!.description).toBe(기본.description);
  });

  /** 정면은 이미 돈을 냈다 — 정체성이 길다고 저장을 거절하면 안 된다. */
  it("2000자를 넘는 정체성은 거절하지 않고 자른다", async () => {
    const response = await post({ ...저장, identityPrompt: "a".repeat(2500) });
    expect(response.status).toBe(200);
    expect(calls.brief).toHaveLength(0);
    expect((calls.create[0]!.identityPrompt as string).length).toBe(2000);
  });

  /** Review Focus 3 — 옛 화면·「과정 보기」로 연 캐릭터는 정체성을 안 보낸다. */
  it("정체성이 없으면 저장 단계가 직접 정리한다", async () => {
    await post(저장);
    expect(calls.brief).toHaveLength(1);
    expect(calls.create[0]!.identityPrompt).toBe("A cat with one head.");
  });
});

describe("내 캐릭터", () => {
  const 내것 = { base64: "bWluZQ==", mimeType: "image/png" };

  it("내 캐릭터와 뽑아내기를 같이 보내면 거절하고 돈을 잡지 않는다", async () => {
    const response = await post({
      ...기본, step: "candidates", ownCharacter: 내것,
      reference: { role: "extract", base64: "Zm9v", mimeType: "image/png" },
    });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/레퍼런스 스타일/);
    expect(calls.reserve).toBe(0);
    expect(calls.candidates).toHaveLength(0);
  });

  it("내 캐릭터를 그림 만들기와 정리에 함께 넘긴다", async () => {
    await post({
      ...기본, look: "auto", step: "candidates", ownCharacter: 내것,
      reference: { role: "style", base64: "Zm9v", mimeType: "image/png" },
    });
    expect(calls.candidates[0]!.ownCharacter).toEqual(내것);
    expect(calls.brief[0]).toMatchObject({ hasOwnCharacter: true, referenceRole: "style" });
  });
});

describe("읽을 수 없는 요청", () => {
  /** 두 그림이 너무 커 본문이 잘리면 `{}` 로 검증해 「무엇을 만들지 적어 주세요」가 떴다. */
  it("JSON 이 아니면 400 으로 거절하고 돈을 잡지 않는다", async () => {
    const response = await POST(new Request("http://local/api/characters", { method: "POST", body: "{\"description\":\"고양이\",\"ownChar" }));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("요청을 읽지 못했습니다. 붙인 그림이 너무 크면 줄여서 다시 올려 주세요.");
    expect(calls.reserve).toBe(0);
  });
});

describe("묘사 길이", () => {
  it("2001자 묘사는 400 으로 거절하고 돈을 잡지 않는다", async () => {
    const response = await post({ ...기본, step: "candidates", description: "가".repeat(2001) });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("묘사는 2000자 이내로 적어 주세요.");
    expect(calls.reserve).toBe(0);
  });

  it("2000자 묘사는 받는다", async () => {
    const response = await post({ ...기본, step: "candidates", description: "가".repeat(2000) });
    expect(response.status).toBe(200);
  });
});
