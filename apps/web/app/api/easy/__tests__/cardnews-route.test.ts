import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「쉽게」 문의 카드뉴스 갈래**(2단계 설계 §3 · §4 · §5 · §7 · §9).
 *
 * 1단계 `generate-route.test.ts` 와 같은 가짜를 쓰고, 카드뉴스 라우트 둘과 카드뉴스
 * 저장소를 더한다. 원고는 공짜다. 여기서 크레딧 라우트(`generate`)를 부르면 안 된다.
 */

vi.mock("server-only", () => ({}));

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const 기본원고 = () => ({
  id: "c1", userId: "me-1", status: "copy_ready", ratio: "4:5", language: "ko", modelId: "gpt-image-2.5-flare",
  cardCountMode: "auto", toneNote: "", title: "t",
  data: {
    source: { kind: "question" as const, question: "q" }, attachments: [] as unknown[], look: "auto",
    flow: {
      planningIssues: [] as string[], copyIssues: [] as string[],
      cards: [
        { index: 1, role: "cover", kind: "generated", copy: { headline: "표지 글" }, status: "pending" },
        { index: 2, role: "body", kind: "generated", copy: { headline: "속지", body: "본문" }, status: "pending" },
      ] as unknown[],
    },
  },
});

let 판단: unknown;
let 역할판단: unknown;
let 원고작업: ReturnType<typeof 기본원고>;
let 카드작업들: Record<string, unknown>;
let 지난줄들: Array<Record<string, unknown>>;
const 남긴줄: Array<{ role: string; body?: string }> = [];
const 읽은사진: string[][] = [];
const 부른라우트: Array<{ step: string; body: Record<string, unknown> }> = [];
const 손본것: Array<Record<string, unknown>> = [];
let 손보기실패 = false;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
  // 판정 예약(master 2026-09-30 §3.1). 여기서 재는 것이 아니라 지나가게만 한다.
  reserveAiUsage: async () => ({ ok: true as const, userId: "me-1", requestId: "decide", usage: undefined }),
  settleAiUsage: async () => ({ remaining: 0 }),
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => 지난줄들,
    appendMessage: async (row: { role: string; body?: string }) => {
      남긴줄.push(row);
      return { id: `m${남긴줄.length}`, ...row };
    },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async () => 판단,
    decideRoles: async () => 역할판단,
    writeEnding: async () => ({ headline: "핵심만 다시", body: "· 목표부터" }),
  }),
}));
vi.mock("../../../../lib/easy/read-photos", () => ({
  readEasyPhotos: async (photos: Array<{ id: string }>) => {
    읽은사진.push(photos.map((photo) => photo.id));
    return Object.fromEntries(photos.map((photo) => [photo.id, { description: "설명", hasPeople: false, hasText: true }]));
  },
}));
vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) =>
    ids.map((id) => ({ id, title: id, url: `https://x.test/${id}.png`, storagePath: `me-1/references/${id}.png` })),
}));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
  llmSettleCost: () => ({ model: "", billableImages: 0 }),
}));
vi.mock("../../poster/projects/route", () => ({
  POST: async (req: Request) => {
    부른라우트.push({ step: "project", body: await req.json() });
    return Response.json({ ok: true, project: { id: "p1" } });
  },
}));
vi.mock("../../poster/projects/[id]/plan/route", () => ({
  POST: async (req: Request) => {
    부른라우트.push({ step: "plan", body: await req.json() });
    return Response.json({ ok: true });
  },
}));
vi.mock("../../poster/projects/[id]/generate/route", () => ({
  POST: async (req: Request) => {
    부른라우트.push({ step: "generate", body: await req.json() });
    return Response.json({ ok: true, submission: { requestRowId: "r", falRequestId: "f", endpoint: "e" } });
  },
}));
vi.mock("../../sns/projects/route", () => ({
  POST: async (req: Request) => {
    부른라우트.push({ step: "cardnews-project", body: await req.json() });
    return Response.json({ ok: true, project: { id: "c1" } });
  },
}));
vi.mock("../../sns/projects/[id]/plan/route", () => ({
  POST: async () => {
    부른라우트.push({ step: "cardnews-plan", body: {} });
    return Response.json({ ok: true, project: 원고작업 });
  },
}));
vi.mock("../../sns/projects/[id]/generate/route", () => ({
  POST: async () => {
    부른라우트.push({ step: "cardnews-generate", body: {} });
    return Response.json({ ok: true });
  },
}));
vi.mock("../../sns/projects/[id]/cards/[index]/route", () => ({
  PATCH: async (req: Request) => {
    const body = await req.json();
    부른라우트.push({ step: "cardnews-ending", body });
    return Response.json({ ok: true, project: 원고작업 });
  },
}));
vi.mock("../../../../lib/easy/cardnews-after-steps", () => ({
  editCard: async (_r: Request, project: { id: string }, index: number, change: unknown) => {
    if (손보기실패) throw new Error("글 모델 실패");
    손본것.push({ what: "edit", index, change });
    return { project: { ...project, edited: true }, needsRedraw: true };
  },
  redoCard: async () => { 손본것.push({ what: "redo" }); return { project: {}, archived: null }; },
  captionCard: async (_r: Request, id: string) => {
    if (손보기실패) throw new Error("게시글 실패");
    손본것.push({ what: "caption", id });
    return { id, captioned: true };
  },
}));
vi.mock("../../../../lib/sns/feature", () => ({ isWebSourceEnabled: () => false }));
vi.mock("../../../../lib/sns-flow-store", () => ({
  snsFlowStoreForUser: async () => ({ get: async (id: string) => 카드작업들[id] ?? null }),
}));
vi.mock("../../../../lib/sns/runtime", () => ({ refreshProjectAssetUrls: async (p: unknown) => p }));

const { POST } = await import("../generate/route");
const { ASK_CARD_NUMBER, NOT_MADE_YET, STILL_GENERATING } = await import("../../../easy/cardnews-after");
const { readAsk } = await import("../../../easy/row-marks");
const { KIND_QUESTION } = await import("../../../easy/turn-words");
const { NO_REFERENCE } = await import("../../../easy/cardnews-attachments");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", prompt: "카드뉴스 만들어줘", imageModel: "gpt-image-2.5-flare", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

const 역할 = (...roles: Array<[string, boolean]>) => ({
  photos: roles.map(([role, said], index) => ({ number: index + 1, role, said })),
  conflicting: false,
});

beforeEach(() => {
  판단 = { wants: "cardnews", reply: "", ratio: "", look: "" };
  역할판단 = { photos: [], conflicting: false };
  원고작업 = 기본원고();
  카드작업들 = {};
  지난줄들 = [];
  남긴줄.length = 0; 읽은사진.length = 0; 부른라우트.length = 0; 손본것.length = 0;
  손보기실패 = false;
});

describe("갈래 (2단계 §4)", () => {
  it("한 장인지 여러 장인지 모르면 두 단추로 묻고 사용자 말과 물음 줄을 남긴다 (2차 D1)", async () => {
    판단 = { wants: "either", reply: "", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "신메뉴 홍보물 만들어줘" });
    expect(json.kindAsk).toBe(true);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "kind", text: KIND_QUESTION, data: { ids: [] } });
    expect(부른라우트).toEqual([]);
  });

  it("고른 갈래가 판단을 이긴다", async () => {
    판단 = { wants: "either", reply: "", ratio: "1:1", look: "" };
    await 보낸다({ prompt: "신메뉴 홍보물 만들어줘", kind: "image" });
    expect(부른라우트.map((c) => c.step)).toEqual(["project", "plan", "generate"]);
  });

  it("고른 갈래는 말 턴에 안 끼어든다", async () => {
    판단 = { wants: "talk", reply: "네", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "고마워요", kind: "cardnews" });
    expect(json.talked).toBe(true);
    expect(부른라우트).toEqual([]);
  });

  /** Review Focus 5 */
  it("이미지 한 장은 지금 그대로", async () => {
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "" };
    await 보낸다({ prompt: "카페 포스터 한 장" });
    expect(부른라우트.map((c) => c.step)).toEqual(["project", "plan", "generate"]);
  });
});

describe("카드뉴스 원고 (2단계 §3 · §5)", () => {
  it("레퍼런스가 없으면 요청하고 사용자 말과 요청 줄을 남긴다 (2차 D1)", async () => {
    const { json } = await 보낸다({ prompt: "건강 카드뉴스" });
    expect(json.needReference).toBe(true);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "reference", text: NO_REFERENCE, data: { wants: "cardnews", ids: [] } });
    expect(부른라우트).toEqual([]);
  });

  it("분위기 참고가 없으면(제품 사진만) 레퍼런스를 요청한다 - 요청 줄에 그 사진을 적는다", async () => {
    역할판단 = 역할(["preserve_product", true]);
    const { json } = await 보낸다({ prompt: "1번 제품으로 카드뉴스", referenceIds: [사진(1)] });
    expect(json.needReference).toBe(true);
    expect(readAsk(남긴줄[1] as never)?.data).toEqual({ wants: "cardnews", ids: [사진(1)] });
    expect(부른라우트).toEqual([]);
  });

  it("분위기 참고가 있으면 만들기 → 원고, 크레딧 라우트는 안 부른다", async () => {
    역할판단 = 역할(["style", false]);
    const { json } = await 보낸다({ prompt: "건강기능식품 고르는 법 카드뉴스", referenceIds: [사진(1)] });

    expect(부른라우트.map((c) => c.step)).toEqual(["cardnews-project", "cardnews-plan"]);
    expect(부른라우트[0]!.body).toMatchObject({
      source: { kind: "question" }, ratio: "4:5", cardCountMode: "fixed", cardCount: 6, language: "ko",
      attachments: [
        { id: 사진(1), kind: "style_reference", role: "cover" },
        { id: 사진(1), kind: "style_reference", role: "body" },
        { id: 사진(1), kind: "style_reference", role: "ending" },
      ],
    });
    expect(json.cardnews.project.id).toBeDefined();
    expect(json.photoRoles).toEqual([{ id: 사진(1), role: "style" }]);
    expect(남긴줄.map((r) => r.role)).toEqual(["user", "image"]);
  });

  it("모르는 사진이 있으면 카드뉴스 역할로 묻고 물음 줄을 남긴다", async () => {
    역할판단 = 역할(["unclear", false]);
    const { json } = await 보낸다({ referenceIds: [사진(1)] });
    expect(json.photoAsk).toEqual({ reason: "unclear", rows: [{ id: 사진(1), role: "unclear" }], mode: "cardnews" });
    expect(readAsk(남긴줄[1] as never)).toMatchObject({ kind: "photo", data: { wants: "cardnews", mode: "cardnews", ids: [사진(1)] } });
    expect(부른라우트).toEqual([]);
  });

  it("기사 주소가 꺼져 있으면 사진도 안 읽고 원고를 안 쓰고 멈춘다", async () => {
    역할판단 = 역할(["style", false]);
    const { status, json } = await 보낸다({ prompt: "https://news.example.com/a 카드뉴스", referenceIds: [사진(1)] });
    expect(status).toBe(400);
    expect(json.retryable).toBe(false);
    expect(읽은사진).toEqual([]);
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  /** Review Focus 4 */
  it("원고 0장이면 까닭을 말하고 원고 줄을 안 남긴다", async () => {
    역할판단 = 역할(["style", false]);
    원고작업 = { ...원고작업, data: { ...원고작업.data, flow: { planningIssues: ["자막이 없습니다"], copyIssues: [], cards: [] } } };
    const { json } = await 보낸다({ prompt: "https://youtu.be/x 카드뉴스", referenceIds: [사진(1)] });
    expect(json.talked).toBe(true);
    expect(남긴줄.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(남긴줄[1]!.body).toContain("자막이 없습니다");
  });

  it("장수 계산이 어긋난 실패는 개발자 말 대신 쉬운 말로 알린다", async () => {
    역할판단 = 역할(["style", false]);
    원고작업 = { ...원고작업, data: { ...원고작업.data, flow: {
      planningIssues: ["주 모델 기획 실패: AI가 고른 8장과 실제 자리 합계 9장이 다릅니다."], copyIssues: [], cards: [],
    } } };
    await 보낸다({ prompt: "건강 카드뉴스", referenceIds: [사진(1)] });
    expect(남긴줄[1]!.body).toBe("원고를 쓰다가 장수 계산이 어긋났습니다. 다시 보내 주시면 한 번 더 씁니다.");
  });
});

describe("마지막 장 (2026-09-30 사용자 결정 B)", () => {
  it("빈 마지막 장이 있으면 고른 글 모델이 쓴 정리 문장으로 채운다", async () => {
    역할판단 = 역할(["style", false]);
    원고작업 = { ...원고작업, data: { ...원고작업.data, flow: { ...원고작업.data.flow, cards: [
      ...원고작업.data.flow.cards,
      { index: 3, role: "ending", kind: "generated", copy: { headline: "핵심 내용을 기억해 주세요" }, status: "pending" },
    ] } } };
    await 보낸다({ prompt: "건강 카드뉴스", referenceIds: [사진(1)] });
    expect(부른라우트.map((c) => c.step)).toEqual(["cardnews-project", "cardnews-plan", "cardnews-ending"]);
    expect(부른라우트[2]!.body).toEqual({ headline: "핵심만 다시", body: "· 목표부터" });
  });
});

describe("다시 쓰기 (2단계 §7)", () => {
  it("원고가 있는 대화에서 고치는 말은 앞 원고 조건으로 새 작업을 만든다, 앞 작업은 그대로", async () => {
    지난줄들 = [{ id: "r1", role: "image", body: "", workId: "old" }];
    카드작업들 = { old: { ...원고작업, id: "old", title: "건강", toneNote: "" } };
    판단 = { wants: "revise", reply: "", ratio: "", look: "" };
    await 보낸다({ prompt: "더 짧게" });

    expect(부른라우트.map((c) => c.step)).toEqual(["cardnews-project", "cardnews-plan"]);
    expect(부른라우트[0]!.body).toMatchObject({ toneNote: "더 짧게", title: "건강" });
  });

  it("원고가 없는 대화에서 고치기로 읽혀도 고치기로 가지 않는다", async () => {
    지난줄들 = [{ id: "r1", role: "image", body: "", workId: "poster-1" }];
    판단 = { wants: "revise", reply: "네, 짧게 해 볼게요.", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "더 짧게" });

    expect(json.talked).toBe(true);
    expect(부른라우트).toEqual([]);
  });
});

describe("만든 카드뉴스 손보기 말 (3단계 §5 · §6-5)", () => {
  const 만든원고 = () => ({ ...원고작업, id: "old", status: "ready", data: { ...원고작업.data, flow: { ...원고작업.data.flow, cards: [
    { index: 1, role: "cover", kind: "generated", copy: { headline: "a" }, status: "done", assetPath: "me-1/sns/old/1.png" },
    { index: 2, role: "body", kind: "generated", copy: { headline: "b" }, status: "done", assetPath: "me-1/sns/old/2.png" },
  ] } } });
  const 판단하면 = (over: Record<string, unknown>) => { 판단 = { wants: "talk", reply: "", ratio: "", look: "", card: 0, note: "", ...over }; };
  beforeEach(() => {
    지난줄들 = [{ id: "r1", role: "image", body: "", workId: "old" }];
    카드작업들 = { old: 만든원고() };
  });

  /** Review Focus 3 */
  it("「2번 다시」는 확인 줄만 돌려주고 아무것도 안 부르고 안 남긴다", async () => {
    판단하면({ wants: "card_redo", card: 2, note: "글자 크게" });
    const { json } = await 보낸다({ prompt: "2번 다시 그려줘, 글자 크게" });
    expect(json.cardAsk).toEqual({ rowId: "r1", index: 2, note: "글자 크게" });
    expect(부른라우트).toEqual([]);
    expect(손본것).toEqual([]);
    expect(남긴줄).toEqual([]);
  });

  /** Review Focus 4 */
  it("없는 번호 · 번호 없음은 몇 번인지 되묻고 아무것도 안 남긴다", async () => {
    판단하면({ wants: "card_text", card: 9, note: "짧게" });
    expect((await 보낸다({ prompt: "9번 더 짧게" })).json.message.body).toBe(ASK_CARD_NUMBER);
    판단하면({ wants: "card_redo", card: 0, note: "" });
    expect((await 보낸다({ prompt: "다시 그려줘" })).json.message.body).toBe(ASK_CARD_NUMBER);
    expect(남긴줄).toEqual([]);
    expect(손본것).toEqual([]);
  });

  /** Review Focus 4 */
  it("만들기 전 원고에 「다시 그려줘」는 먼저 만들라고 답한다", async () => {
    카드작업들 = { old: { ...원고작업, id: "old" } };
    판단하면({ wants: "card_redo", card: 1 });
    const { json } = await 보낸다({ prompt: "1번 다시 그려줘" });
    expect(json.message.body).toBe(NOT_MADE_YET);
    expect(손본것).toEqual([]);
  });

  it("「2번 더 짧게」는 그 장만 고치고 말과 결과를 남긴다", async () => {
    판단하면({ wants: "card_text", card: 2, note: "더 짧게" });
    const { json } = await 보낸다({ prompt: "2번 더 짧게" });
    expect(손본것).toEqual([{ what: "edit", index: 2, change: { words: "더 짧게" } }]);
    expect(남긴줄.map((row) => [row.role, row.body])).toEqual([["user", "2번 더 짧게"], ["assistant", "2번 장 글을 고쳤습니다."]]);
    expect(json.cardEdited).toMatchObject({ rowId: "r1", index: 2, needsRedraw: true, project: { id: "old" } });
    expect(json.cardEdited.project.edited).toBeUndefined();
  });

  /** 독립 리뷰 Important 3 */
  it("만드는 중에 「2번 더 짧게」는 다 만든 뒤 하라고 답하고 아무것도 안 남긴다", async () => {
    카드작업들 = { old: { ...만든원고(), status: "generating" } };
    판단하면({ wants: "card_text", card: 2, note: "더 짧게" });
    const { json } = await 보낸다({ prompt: "2번 더 짧게" });
    expect(json.message.body).toBe(STILL_GENERATING);
    expect(손본것).toEqual([]);
    expect(남긴줄).toEqual([]);
  });

  it("게시글 · 받기", async () => {
    판단하면({ wants: "caption" });
    const 게시글 = (await 보낸다({ prompt: "올릴 글 써줘" })).json;
    // 다시 읽어 새로 서명한 작업을 준다(독립 리뷰).
    expect(게시글.caption).toMatchObject({ rowId: "r1", project: { id: "old" } });
    expect(게시글.caption.project.captioned).toBeUndefined();
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    판단하면({ wants: "download" });
    expect((await 보낸다({ prompt: "다 받을게" })).json.download).toEqual({ rowId: "r1" });
  });
});

describe("미뤄 둔 작은 것 (2026-10-01)", () => {
  const 만든원고 = () => ({ ...원고작업, id: "old", status: "ready", data: { ...원고작업.data, flow: { ...원고작업.data.flow, cards: [
    { index: 1, role: "cover", kind: "generated", copy: { headline: "a" }, status: "done", assetPath: "me-1/sns/old/1.png" },
    { index: 2, role: "body", kind: "generated", copy: { headline: "b" }, status: "done", assetPath: "me-1/sns/old/2.png" },
  ] } } });
  beforeEach(() => {
    지난줄들 = [{ id: "r1", role: "image", body: "", workId: "old" }];
    카드작업들 = { old: 만든원고() };
  });

  /** 1: 남기지 않은 답에 빈 id 를 주면 화면이 두 답을 같은 줄로 본다. */
  it("남기지 않은 답에는 id 를 안 준다(화면이 저마다 짓는다)", async () => {
    판단 = { wants: "card_text", reply: "", ratio: "", look: "", card: 9, note: "" };
    const { json } = await 보낸다({ prompt: "9번 짧게" });
    expect(json.message).not.toHaveProperty("id");
  });

  /** 5: 고치기 · 게시글이 실패하면 답 없는 말만 남았다. */
  it("글 고치기 · 게시글이 실패하면 사용자 말도 남기지 않는다", async () => {
    손보기실패 = true;
    판단 = { wants: "card_text", reply: "", ratio: "", look: "", card: 2, note: "짧게" };
    await 보낸다({ prompt: "2번 짧게" });
    판단 = { wants: "caption", reply: "", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "올릴 글 써줘" });
    expect(남긴줄).toEqual([]);
  });
});
