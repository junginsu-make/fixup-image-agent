import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「쉽게」 문 — 「광고 소재」 물음 · 규격 안내**(2026-10-06 설계 A5).
 *
 * 물음 · 안내는 도우미 줄로 남고, 다음 말은 늘 처음부터 판단한다(모드로 붙잡지 않는다).
 */
vi.mock("server-only", () => ({}));

let 판단: unknown;
let 지난줄: Array<{ id: string; role: string; body: string; workId: string | null }>;
const 남긴줄: Array<{ role: string; body?: string }> = [];
const 부른라우트: Array<{ step: string; body: Record<string, unknown> }> = [];
const 센것 = { reserve: 0, decide: 0, guide: 0 };
let 받은갈래: string[] = [];
let 받은안내글 = "";
let 안내실패 = false;
// 포스터 저장소에 있는 작업(이미지 수 세기 · 마지막 이미지 찾기가 본다).
let 포스터작업 = new Set<string>();

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
  reserveAiUsage: async () => {
    센것.reserve += 1;
    return { ok: true as const, userId: "me-1", requestId: "decide", usage: undefined };
  },
  settleAiUsage: async () => ({ remaining: 0 }),
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => 지난줄,
    appendMessage: async (row: { role: string; body?: string }) => {
      남긴줄.push(row);
      return { id: `m${남긴줄.length}`, ...row };
    },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async (_prompt: string, wants: readonly string[]) => {
      센것.decide += 1;
      받은갈래 = [...wants];
      return 판단;
    },
    decideRoles: async () => ({ photos: [], conflicting: false }),
    writeAdGuide: async (prompt: string) => {
      센것.guide += 1;
      받은안내글 = prompt;
      if (안내실패) throw new Error("upstream timeout");
      return { text: "「광고소재」에서 01 → 02 → 03 순서로 합니다." };
    },
  }),
}));
vi.mock("../../../../lib/easy/cardnews-steps", async (original) => ({
  ...(await original<object>()),
  lastCardnewsProject: async () => null,
}));
vi.mock("../../../../lib/easy/read-photos", () => ({ readEasyPhotos: async () => ({}) }));
vi.mock("../../../../lib/poster/references", () => ({ posterReferencesByIds: async () => [] }));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
  llmSettleCost: () => ({ model: "", billableImages: 0 }),
}));
vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async (id: string) => (포스터작업.has(id) ? { id, ratio: "1:1", data: {} } : undefined) },
    images: { byProject: async () => [] },
  }),
}));
const 라우트 = (step: string) => ({
  POST: async (req: Request) => {
    부른라우트.push({ step, body: await req.json() });
    return step === "project"
      ? Response.json({ ok: true, project: { id: "p1" } })
      : Response.json({ ok: true, submission: { requestRowId: "r1", falRequestId: "f1", endpoint: "e" } });
  },
});
vi.mock("../../poster/projects/route", () => 라우트("project"));
vi.mock("../../poster/projects/[id]/plan/route", () => 라우트("plan"));
vi.mock("../../poster/projects/[id]/generate/route", () => 라우트("generate"));

const { POST } = await import("../generate/route");
const { AD_ANSWER_NOTE, AD_CHOICE_IMAGE, AD_CHOICE_SPECS, AD_QUESTION, adGuideBody } = await import("../../../easy/ad-ask");
const { AD_GUIDE_FALLBACK } = await import("../../../easy/ad-guide");
const { readAsk } = await import("../../../easy/row-marks");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", imageModel: "gpt-image-2.5-flare", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

const 처음말 = "겨울 화장품 광고 소재 만들어줘";
const 물은뒤 = () => [
  { id: "u1", role: "user", body: 처음말, workId: null },
  { id: "q1", role: "assistant", body: AD_QUESTION, workId: null },
];
const 안내글 = "「광고소재」에서 01 → 02 → 03 순서로 합니다.";

beforeEach(() => {
  판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "" };
  지난줄 = [];
  남긴줄.length = 0; 부른라우트.length = 0;
  센것.reserve = 0; 센것.decide = 0; 센것.guide = 0;
  받은갈래 = [];
  받은안내글 = ""; 안내실패 = false; 포스터작업 = new Set();
});

describe("「광고 소재」 물음", () => {
  it("규격 낱말이 없으면 글 모델 없이 묻고, 말과 물음을 대화에 남긴다", async () => {
    const { json } = await 보낸다({ prompt: 처음말 });
    expect(json).toMatchObject({ ok: true, talked: true, message: { body: AD_QUESTION } });
    expect(남긴줄.map((row) => [row.role, row.body])).toEqual([["user", 처음말], ["assistant", AD_QUESTION]]);
    expect(센것).toEqual({ reserve: 0, decide: 0, guide: 0 });
    expect(부른라우트).toEqual([]);
  });

  it("규격 낱말이 있으면 묻지 않고 안내를 남긴다 — 판단 모델은 안 부르고, 예약 안에서 안내를 쓴다", async () => {
    const { json } = await 보낸다({ prompt: "광고 소재 네이버 카카오 규격별로" });
    expect(json.talked).toBe(true);
    expect(센것).toEqual({ reserve: 1, decide: 0, guide: 1 });
    expect(남긴줄[1]).toMatchObject({ role: "assistant", body: adGuideBody(안내글) });
    expect(부른라우트).toEqual([]);
  });
});

describe("물음 뒤의 답", () => {
  beforeEach(() => { 지난줄 = 물은뒤(); });

  it("「광고 이미지 만들기」 단추면 처음 말로 이미지를 만든다", async () => {
    await 보낸다({ prompt: AD_CHOICE_IMAGE, ratio: "1:1" });
    expect(센것.decide).toBe(0);
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
    expect(부른라우트[0]!.body.instruction).toBe(처음말);
    expect(남긴줄[0]).toMatchObject({ role: "user", body: AD_CHOICE_IMAGE });
  });

  it("「광고 이미지 만들기」 뒤에 모양을 물으면 물음 줄에 이어짐(cont)을 적는다 - 다음 답이 처음 말을 잇는다 (2차 D1)", async () => {
    await 보낸다({ prompt: AD_CHOICE_IMAGE });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readAsk(남긴줄[1] as never)).toMatchObject({ kind: "ratio", data: { cont: true, wants: "image" } });
    expect(부른라우트).toEqual([]);
  });

  it("말로 「광고 이미지로요」라고 답하고 모델이 답이라고 표시하면 처음 말 + 답으로 만든다", async () => {
    판단 = { ...(판단 as object), note: AD_ANSWER_NOTE };
    await 보낸다({ prompt: "광고 이미지로요", ratio: "1:1" });
    expect(센것.decide).toBe(1);
    expect(부른라우트[0]!.body.instruction).toBe(`${처음말}\n광고 이미지로요`);
  });

  /**
   * 최종 리뷰(2026-10-06): 물음에 답하지 않고 다른 것을 시켰는데 처음 말을 붙이면
   * 「겨울 화장품 광고 소재 + 고양이 포스터」를 그린다.
   */
  it("물음 뒤라도 답이 아닌 이미지 주문이면 그 말 그대로 만든다", async () => {
    const 말 = "그건 됐고 고양이 포스터 만들어줘";
    await 보낸다({ prompt: 말, ratio: "1:1" });
    expect(센것.decide).toBe(1);
    expect(부른라우트[0]!.body.instruction).toBe(말);
  });

  it("「규격별로 베리에이션」 단추면 안내를 남긴다", async () => {
    await 보낸다({ prompt: AD_CHOICE_SPECS });
    expect(센것.guide).toBe(1);
    expect(부른라우트).toEqual([]);
  });

  it("말로 「사이즈별로요」라고 하면 코드가 규격 안내로 정한다 — 판단 모델을 안 부른다", async () => {
    await 보낸다({ prompt: "사이즈별로요" });
    expect(센것).toEqual({ reserve: 1, decide: 0, guide: 1 });
    expect(남긴줄[1]).toMatchObject({ role: "assistant", body: adGuideBody(안내글) });
  });

  it("규격 낱말 없이 말로 답해 모델이 ad_specs 를 고르면 안내를 남긴다", async () => {
    판단 = { ...(판단 as object), wants: "ad_specs" };
    await 보낸다({ prompt: "여러 크기로 뽑고 싶어요" });
    expect(센것.decide).toBe(1);
    expect(센것.guide).toBe(1);
  });

  it("물음 뒤 답에 「광고 소재」가 또 있어도 다시 묻지 않는다", async () => {
    await 보낸다({ prompt: "광고 소재로 쓸 이미지요", ratio: "1:1" });
    expect(남긴줄.map((row) => row.body)).not.toContain(AD_QUESTION);
    expect(센것.decide).toBe(1);
  });

  it("물음에 답하지 않고 다른 말을 하면 그 말을 따른다 — 붙잡지 않는다", async () => {
    판단 = { ...(판단 as object), wants: "talk", reply: "네, 안녕하세요" };
    const { json } = await 보낸다({ prompt: "그건 됐고 안녕" });
    expect(json.message.body).toBe("네, 안녕하세요");
  });
});

describe("규격 안내 글 (최종 리뷰 2026-10-06)", () => {
  it("이 대화에서 만든 이미지 수는 서로 다른 포스터 작업만 센다", async () => {
    포스터작업 = new Set(["p1", "p2"]);
    지난줄 = [
      { id: "i1", role: "image", body: "", workId: "p1" },
      { id: "i2", role: "image", body: "", workId: "p1" },
      { id: "i3", role: "image", body: "", workId: "p2" },
      { id: "i4", role: "image", body: "", workId: "card-1" },
      ...물은뒤(),
    ];
    await 보낸다({ prompt: AD_CHOICE_SPECS });
    expect(받은안내글).toContain("만든 이미지가 2장 있습니다");
  });

  it("안내 글 모델이 실패해도 대화는 멈추지 않는다 — 코드가 쓴 안내를 남긴다", async () => {
    안내실패 = true;
    const { status, json } = await 보낸다({ prompt: "광고 소재 네이버 카카오 규격별로" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, talked: true });
    expect(남긴줄.map((row) => [row.role, row.body])).toEqual([
      ["user", "광고 소재 네이버 카카오 규격별로"], ["assistant", adGuideBody(AD_GUIDE_FALLBACK)],
    ]);
  });

  it("갈래를 단추로 골랐으면 판단이 ad_specs 여도 안내를 안 쓰고 그 갈래로 만든다", async () => {
    판단 = { ...(판단 as object), wants: "ad_specs" };
    await 보낸다({ prompt: "겨울 화장품 배너", kind: "image", kindPicked: true, ratio: "1:1" });
    expect(센것.guide).toBe(0);
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });
});

describe("대화는 끊기지 않는다", () => {
  it("안내 뒤에 「이미지 더 만들 거야」면 그 말로 이미지를 만든다", async () => {
    지난줄 = [
      ...물은뒤(),
      { id: "u2", role: "user", body: AD_CHOICE_SPECS, workId: null },
      { id: "g1", role: "assistant", body: adGuideBody("안내"), workId: null },
    ];
    const 말 = "아니야, 이미지 더 만들 거야. 겨울 화장품 이미지 만들어줘";
    await 보낸다({ prompt: 말, ratio: "1:1" });
    expect(부른라우트[0]!.body.instruction).toBe(말);
  });

  it("「광고 소재 말고」면 묻지 않고, 규격 안내를 선택지에서 뺀 채 판단 모델에 묻는다", async () => {
    await 보낸다({ prompt: "광고 소재 말고 그냥 이미지 만들어줘", ratio: "1:1" });
    expect(센것.decide).toBe(1);
    expect(받은갈래).not.toContain("ad_specs");
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });

  it("「광고 소재」 없이 여러 규격을 말해 모델이 ad_specs 를 고르면 안내한다", async () => {
    판단 = { ...(판단 as object), wants: "ad_specs" };
    await 보낸다({ prompt: "구글 배너 사이즈별로 다" });
    expect(받은갈래).toContain("ad_specs");
    expect(센것.guide).toBe(1);
  });
});
