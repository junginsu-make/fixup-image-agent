import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「쉽게」 문 — 만든 이미지 이어서 고치기** (2026-10-06 사용자 보고).
 *
 * 실제로 난 일: 이미지를 만든 대화에서 「로고 사진에 있는 로고로 변경해줘」 →
 * 판단 모델은 `revise`(실측 6/6) → 원고가 없어 빈 답의 `talk` → 「무엇을 만들어
 * 드릴까요?」 되풀이. 여기서는 그 대화를 그대로 넣고 문이 **고치기를 부르는지** 잰다.
 */

vi.mock("server-only", () => ({}));

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let 판단: unknown;
let 지난줄: Array<{ id: string; role: string; body: string; workId: string | null }>;
const 남긴줄: Array<{ role: string; body?: string; workId?: string | null }> = [];
const 부른라우트: Array<{ step: string; url: string; body: Record<string, unknown> }> = [];
let 받은갈래: string[] = [];
let 고치기실패 = false;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
  reserveAiUsage: async () => ({ ok: true as const, userId: "me-1", requestId: "decide", usage: undefined }),
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
    decide: async (_prompt: string, wants: readonly string[]) => { 받은갈래 = [...wants]; return 판단; },
    decideRoles: async () => ({ photos: [], conflicting: false }),
  }),
}));
vi.mock("../../../../lib/easy/cardnews-steps", async (original) => ({
  ...(await original<object>()),
  lastCardnewsProject: async () => null,
}));
vi.mock("../../../../lib/easy/read-photos", () => ({ readEasyPhotos: async () => ({}) }));
vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) => ids.map((id) => ({ id, title: id, url: `https://x.test/${id}.png` })),
}));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
  llmSettleCost: () => ({ model: "", billableImages: 0 }),
}));
vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async (id: string) => (id === "p1"
        ? { id: "p1", ratio: "1:1", data: { referenceIds: [사진(1)], preservedIds: [], personIds: [], restyledIds: [] } }
        : undefined),
    },
    images: { byProject: async () => [{ id: "img-1", generationRequestId: "r1", selected: false }] },
  }),
}));
const 라우트 = (step: string) => ({
  POST: async (req: Request) => {
    부른라우트.push({ step, url: req.url, body: await req.json() });
    if (step === "edit" && 고치기실패) return Response.json({ ok: false, message: "고치기가 막혔습니다." }, { status: 403 });
    return step === "project"
      ? Response.json({ ok: true, project: { id: "new" } })
      : Response.json({ ok: true, submission: { requestRowId: `${step}-row`, falRequestId: "f", endpoint: "e" } });
  },
});
vi.mock("../../poster/projects/route", () => 라우트("project"));
vi.mock("../../poster/projects/[id]/plan/route", () => 라우트("plan"));
vi.mock("../../poster/projects/[id]/generate/route", () => 라우트("generate"));
vi.mock("../../poster/projects/[id]/edit/route", () => 라우트("edit"));

const { POST } = await import("../generate/route");
const { NOTHING_TO_EDIT } = await import("../../../easy/chat");
const { failureRowBody } = await import("../../../../lib/easy/failure-row");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", imageModel: "gpt-image-2.5-flare", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

const 로고바꿔줘 = "지금 생성한 사진 맨 오른쪽 맨 밑에 있는 로고 사진에 있는 로고로 변경해줘";

beforeEach(() => {
  판단 = { wants: "revise", reply: "", ratio: "", look: "", card: 0, note: "" };
  지난줄 = [
    { id: "u1", role: "user", body: "화장품을 넣어줘", workId: null },
    { id: "i1", role: "image", body: "", workId: "p1" },
  ];
  남긴줄.length = 0; 부른라우트.length = 0;
  고치기실패 = false;
});

describe("이미지를 만든 대화에서 고쳐 달라고 하면", () => {
  it("모델이 revise 라고 해도 마지막 이미지를 고친다 — 「무엇을 만들어 드릴까요?」가 아니다", async () => {
    const { status, json } = await 보낸다({ prompt: 로고바꿔줘, referenceIds: [사진(1), 사진(2)] });
    expect(status).toBe(200);
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
    expect(부른라우트[0]!.url).toContain("/api/poster/projects/p1/edit");
    // 2차 D3: 첨부는 쓴 뒤 내려간다 — 붙어 있으면 일부러 붙인 것이라 다 넣는다(지킬 사진만 뺀다. 이 작업엔 없다).
    expect(부른라우트[0]!.body).toEqual({ instruction: 로고바꿔줘, imageId: "img-1", addedReferenceIds: [사진(1), 사진(2)] });
    expect(json).toMatchObject({ ok: true, projectId: "p1", submission: { requestRowId: "edit-row" } });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "image"]);
  });

  it("모델이 image_edit 이라고 해도 같다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "배경만 파랗게" });
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
  });

  it("새 이미지를 말하면(image) 지금처럼 새로 만든다 — 고치기를 안 부른다", async () => {
    판단 = { ...(판단 as object), wants: "image", ratio: "1:1" };
    await 보낸다({ prompt: "고양이 포스터 새로 만들어줘" });
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });
});

describe("고칠 것이 없는 대화에서 고쳐 달라고 하면", () => {
  it("빈 답이 아니라 안내를 한다 — 값도 안 나간다", async () => {
    지난줄 = [{ id: "u1", role: "user", body: "안녕", workId: null }];
    const { json } = await 보낸다({ prompt: 로고바꿔줘 });
    expect(부른라우트).toEqual([]);
    expect(json.talked).toBe(true);
    expect(json.message.body).toBe(NOTHING_TO_EDIT);
  });
});

describe("선택지와 고른 갈래 (2026-10-06 A1 · A2)", () => {
  it("이미지를 만든 대화면 선택지에 image_edit 이 있다", async () => {
    await 보낸다({ prompt: "배경만 파랗게" });
    expect(받은갈래).toContain("image_edit");
  });

  it("만든 것이 없는 대화면 선택지에 고치기 갈래가 없다", async () => {
    지난줄 = [{ id: "u1", role: "user", body: "안녕", workId: null }];
    await 보낸다({ prompt: 로고바꿔줘 });
    expect(받은갈래).not.toContain("image_edit");
    expect(받은갈래).not.toContain("revise");
  });

  it("「이미지 한 장」을 고른 답이면 마지막 이미지를 고치지 않고 새로 만든다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "광고 사진을 만들어주세요", kind: "image", kindPicked: true, ratio: "1:1" });
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });

  it("단추로 고른 것이 아니면(이어 온 갈래) 고치기 판단을 따른다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "배경만 파랗게", kind: "image" });
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
  });
});

describe("고치기가 실패하면 (2026-10-06 B4)", () => {
  it("말 뒤에 실패 안내를 남긴다", async () => {
    고치기실패 = true;
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "배경만 파랗게" });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(남긴줄[1]!.body).toBe(failureRowBody("고치기가 막혔습니다."));
  });
});
