import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **이미지를 본다 — 묻거나 볼 때만**(2026-10-07 2차 설계 D5 · §3-5). 판단 모델이 볼 것(`see`)을 적은
 * talk 턴에만 두 번째 호출을 한다. 판정 예약(0크레딧 `easy:decide`)이 닫히기 전에 부른다 — relay
 * 단계를 늘리지 않는다. 그 밖의 턴은 값이 늘지 않는다. 보기 호출은 가짜로 잰다(값 0).
 */
vi.mock("server-only", () => ({}));

let 판단: unknown;
let 본결과: { kind: "seen"; reply: string } | { kind: "none" } | { kind: "failed" };
const 차례: string[] = [];
const 본것: Array<Record<string, unknown>> = [];
const 남긴줄: Array<{ role: string; body?: string }> = [];
const 붙인사진 = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", storagePath: "me-1/references/a.jpg", url: "https://signed.test/a" };

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
  reserveAiUsage: async () => { 차례.push("reserve"); return { ok: true as const, userId: "me-1", requestId: "decide", usage: undefined }; },
  settleAiUsage: async () => { 차례.push("settle"); return { remaining: 0 }; },
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => [
      { id: "u1", role: "user", body: "카페 포스터", workId: null },
      { id: "i1", role: "image", body: "", workId: "p1" },
    ],
    appendMessage: async (row: { role: string; body?: string }) => { 남긴줄.push(row); return { id: `m${남긴줄.length}`, ...row }; },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async () => { 차례.push("decide"); return 판단; },
    decideRoles: async () => ({ photos: [], conflicting: false }),
  }),
}));
vi.mock("../../../../lib/easy/image-list", () => ({
  loadEasyImages: async () => ({
    entries: [{ n: 1, rowId: "i1", workId: "p1", kind: "image", state: "done", words: "카페 포스터" }],
    posters: new Set(["p1"]), pictures: new Map(), madeImage: true, lastIsImage: true,
  }),
}));
vi.mock("../../../../lib/easy/see-turn", () => ({
  rewriteReplyBySeeing: async (input: Record<string, unknown>) => { 차례.push("see"); 본것.push(input); return 본결과; },
}));
vi.mock("../../../../lib/easy/cardnews-steps", async (original) => ({
  ...(await original<object>()), lastCardnewsProject: async () => null, cardnewsProjectIds: async () => new Set<string>(),
}));
vi.mock("../../../../lib/easy/read-photos", () => ({ readEasyPhotos: async () => ({}) }));
vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) => (ids.includes(붙인사진.id) ? [붙인사진] : []),
}));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
  llmSettleCost: () => ({ model: "", billableImages: 0 }),
}));
const 라우트 = (step: string) => ({
  POST: async () => {
    차례.push(step);
    return step === "project"
      ? Response.json({ ok: true, project: { id: "p9" } })
      : Response.json({ ok: true, submission: { requestRowId: "r", falRequestId: "f", endpoint: "e" } });
  },
});
vi.mock("../../poster/projects/route", () => 라우트("project"));
vi.mock("../../poster/projects/[id]/plan/route", () => 라우트("plan"));
vi.mock("../../poster/projects/[id]/generate/route", () => 라우트("generate"));

const { POST } = await import("../generate/route");
const { SEE_FAILED } = await import("../../../easy/see-prompt");

const 보낸다 = async (prompt: string, more: Record<string, unknown> = {}) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", prompt, imageModel: "gpt-image-2.5-flare", ...more }),
  }));
  return { status: response.status, json: await response.json() };
};

beforeEach(() => {
  판단 = { wants: "talk", reply: "방금 이미지를 살펴보고 말씀드릴게요. 글자 크기와 배경을 보겠습니다.", ratio: "", look: "", card: 0, note: "", target: 0, see: ["1"] };
  본결과 = { kind: "seen", reply: "글자가 커서 멀리서도 잘 보여요. 배경을 조금 밝게 하면 더 좋겠어요." };
  차례.length = 0; 본것.length = 0; 남긴줄.length = 0;
});

describe("이미지를 보고 답하기 (2차 D5)", () => {
  it("볼 것을 적은 talk 턴이면 판정 예약 안에서 보고, 다시 쓴 답을 남긴다", async () => {
    const { json } = await 보낸다("방금 거 어때?");
    expect(차례).toEqual(["reserve", "decide", "see", "settle"]);
    expect(본것[0]).toMatchObject({ see: ["1"], prompt: "방금 거 어때?", userId: "me-1" });
    expect(json.message.body).toBe("글자가 커서 멀리서도 잘 보여요. 배경을 조금 밝게 하면 더 좋겠어요.");
  });

  /** 붙인 사진은 ⓪ 확인(`posterReferencesByIds`)을 지난 행만 넘긴다 — 화면이 보낸 주소 · 경로는 안 쓴다. */
  it("붙인 사진은 ⓪ 확인을 지난 행 그대로 넘긴다", async () => {
    판단 = { ...(판단 as object), see: ["p1"] };
    await 보낸다("이 사진 어때?", {
      referenceIds: [붙인사진.id], url: "https://evil.test/x.png", storagePath: "other/references/x.jpg",
    });
    expect(본것[0]!.photos).toEqual([붙인사진]);
  });

  it("볼 것이 없으면 부르지 않는다 — 값이 늘지 않는다", async () => {
    판단 = { wants: "talk", reply: "네, 안녕하세요.", ratio: "", look: "", card: 0, note: "", target: 0, see: [] };
    await 보낸다("안녕");
    expect(차례).not.toContain("see");
  });

  it("만들기 턴에는 볼 것을 적어도 부르지 않는다 — 고치기 · 만들기 모델이 직접 본다", async () => {
    판단 = { wants: "image", reply: "만들겠습니다.", ratio: "1:1", look: "", card: 0, note: "", target: 0, see: ["1"] };
    await 보낸다("이거랑 비슷하게 하나 더");
    expect(차례).not.toContain("see");
    expect(차례).toContain("project");
  });

  /** 옛 화면이 갈래를 단추로 골라 보내면 고른 갈래가 talk 를 이긴다 — 버려질 답을 보려고 값을 쓰지 않는다. */
  it("갈래를 단추로 고른 턴에는 부르지 않는다", async () => {
    await 보낸다("방금 거 어때?", { kind: "image", kindPicked: true, ratio: "1:1" });
    expect(차례).not.toContain("see");
  });

  it("볼 것이 실제로 없었으면(없는 번호) 판단 모델의 답 그대로다 — 혼자서도 뜻이 통하게 쓴 답이다", async () => {
    본결과 = { kind: "none" };
    const { json } = await 보낸다("방금 거 어때?");
    expect(json.message.body).toBe("방금 이미지를 살펴보고 말씀드릴게요. 글자 크기와 배경을 보겠습니다.");
  });

  /** 2차 최종 리뷰 10 — 보기가 실패하면 「살펴볼게요」류의 짧은 답을 남기지 않고 못 봤다고 사실대로 말한다. */
  it("보기가 실패하면 판단의 답 대신 「지금은 이미지를 볼 수 없었습니다」를 남긴다", async () => {
    본결과 = { kind: "failed" };
    const { json } = await 보낸다("방금 거 어때?");
    expect(json.message.body).toBe(SEE_FAILED);
    expect(차례).toEqual(["reserve", "decide", "see", "settle"]);
  });
});
