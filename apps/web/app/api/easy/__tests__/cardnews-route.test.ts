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

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
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
vi.mock("../../../../lib/sns/feature", () => ({ isWebSourceEnabled: () => false }));
vi.mock("../../../../lib/sns-flow-store", () => ({
  snsFlowStoreForUser: async () => ({ get: async (id: string) => 카드작업들[id] ?? null }),
}));
vi.mock("../../../../lib/sns/runtime", () => ({ refreshProjectAssetUrls: async (p: unknown) => p }));

const { POST } = await import("../generate/route");

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
  남긴줄.length = 0; 읽은사진.length = 0; 부른라우트.length = 0;
});

describe("갈래 (2단계 §4)", () => {
  it("한 장인지 여러 장인지 모르면 두 단추로 묻고 아무것도 안 남긴다", async () => {
    판단 = { wants: "either", reply: "", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "신메뉴 홍보물 만들어줘" });
    expect(json.kindAsk).toBe(true);
    expect(남긴줄).toEqual([]);
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
  it("레퍼런스가 없으면 요청하고 아무것도 안 남긴다", async () => {
    const { json } = await 보낸다({ prompt: "건강 카드뉴스" });
    expect(json.needReference).toBe(true);
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("분위기 참고가 없으면(제품 사진만) 레퍼런스를 요청한다", async () => {
    역할판단 = 역할(["preserve_product", true]);
    const { json } = await 보낸다({ prompt: "1번 제품으로 카드뉴스", referenceIds: [사진(1)] });
    expect(json.needReference).toBe(true);
    expect(남긴줄).toEqual([]);
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

  it("모르는 사진이 있으면 카드뉴스 역할로 묻는다", async () => {
    역할판단 = 역할(["unclear", false]);
    const { json } = await 보낸다({ referenceIds: [사진(1)] });
    expect(json.photoAsk).toEqual({ reason: "unclear", rows: [{ id: 사진(1), role: "unclear" }], mode: "cardnews" });
    expect(남긴줄).toEqual([]);
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
