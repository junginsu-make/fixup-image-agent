import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「쉽게」 문**(설계 §2-3 · §2-6 · §2-7).
 *
 * 판단은 순수 모듈들이 잰다(`photo-*.ts`). 여기서는 **문**을 잰다 — 무엇을 언제
 * 부르고, 무엇을 안 부르고, 무엇을 남기는가. 값이 나가는 라우트(기획·생성)를
 * 부르기 전에 멈춰야 하는 자리가 여럿이다.
 */

vi.mock("server-only", () => ({}));

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let 판단: unknown;
let 역할판단: unknown;
let 역할판단실패: Error | null;
let 볼수있는사진: string[];
const 남긴줄: Array<{ role: string; body?: string }> = [];
const 읽은사진: string[][] = [];
const 부른라우트: Array<{ step: string; body: Record<string, unknown> }> = [];
const 부른횟수 = { decide: 0, roles: 0 };

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => [],
    appendMessage: async (row: { role: string; body?: string }) => {
      남긴줄.push(row);
      return { id: `m${남긴줄.length}`, ...row };
    },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async () => { 부른횟수.decide += 1; return 판단; },
    decideRoles: async () => {
      부른횟수.roles += 1;
      if (역할판단실패) throw 역할판단실패;
      return 역할판단;
    },
  }),
}));
vi.mock("../../../../lib/easy/read-photos", () => ({
  readEasyPhotos: async (photos: Array<{ id: string }>) => {
    읽은사진.push(photos.map((photo) => photo.id));
    return Object.fromEntries(photos.map((photo) => [photo.id, "설명"]));
  },
}));
vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) =>
    ids.filter((id) => 볼수있는사진.includes(id)).map((id) => ({ id, title: id, url: `https://x.test/${id}.png` })),
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

const { POST } = await import("../generate/route");
const { DETAIL_PAGE_GUIDE } = await import("../../../easy/detail-page");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", prompt: "카페 포스터 만들어줘", imageModel: "gpt-image-2.5-flare", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

const 역할 = (...roles: Array<[string, boolean]>) => ({
  photos: roles.map(([role, said], index) => ({ number: index + 1, role, said })),
  conflicting: false,
});

beforeEach(() => {
  판단 = { wants: "image", reply: "", ratio: "", look: "" };
  역할판단 = { photos: [], conflicting: false };
  역할판단실패 = null;
  볼수있는사진 = [사진(1), 사진(2), 사진(3)];
  남긴줄.length = 0; 읽은사진.length = 0; 부른라우트.length = 0;
  부른횟수.decide = 0; 부른횟수.roles = 0;
});

describe("⓪ 사진 확인", () => {
  it("볼 수 없는 사진이 하나라도 있으면 아무것도 안 부르고 멈춘다", async () => {
    볼수있는사진 = [사진(1)];
    const { status, json } = await 보낸다({ referenceIds: [사진(1), 사진(2)] });

    expect(status).toBe(400);
    expect(json.retryable).toBe(false);
    expect(부른횟수.decide).toBe(0);
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("사진 id 모양이 아니면 조회 전에 멈춘다", async () => {
    const { status } = await 보낸다({ referenceIds: ["../etc"] });

    expect(status).toBe(400);
    expect(부른횟수.decide).toBe(0);
  });
});

describe("사진을 읽지 않는 턴", () => {
  it("말 턴에는 사진을 읽지 않는다", async () => {
    판단 = { wants: "talk", reply: "안녕하세요!", ratio: "", look: "" };
    await 보낸다({ prompt: "안녕하세요", referenceIds: [사진(1)] });

    expect(읽은사진).toEqual([]);
    expect(부른횟수.roles).toBe(0);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
  });

  it("상세페이지 요청은 안내만 남기고, 사진을 안 읽고, 아무 라우트도 안 부른다", async () => {
    판단 = { wants: "detail_page", reply: "", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "이 제품 상세페이지 만들어줘", referenceIds: [사진(1)] });

    expect(json.talked).toBe(true);
    expect(남긴줄[1]).toEqual({ conversationId: "c1", role: "assistant", body: DETAIL_PAGE_GUIDE });
    expect(읽은사진).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("사진 없는 주문은 지금 그대로다", async () => {
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "" };
    await 보낸다({});

    expect(부른횟수.roles).toBe(0);
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
    expect(부른라우트[0]!.body).toMatchObject({
      referenceIds: [], preservedIds: [], personIds: [], restyledIds: [], attachmentOrder: [], attachmentIntent: "",
    });
  });
});

describe("물을 때는 아무것도 안 남긴다 (설계 §2-5)", () => {
  it("모르는 사진이 있으면 묻는다", async () => {
    역할판단 = 역할(["unclear", false]);
    const { json } = await 보낸다({ referenceIds: [사진(1)] });

    expect(json.photoAsk).toEqual({ reason: "unclear", rows: [{ id: 사진(1), role: "unclear" }] });
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("인물 사진이 둘이면 한 장만 되도록 묻는다", async () => {
    역할판단 = 역할(["preserve_person", true], ["preserve_person", true]);
    const { json } = await 보낸다({ referenceIds: [사진(1), 사진(2)] });

    expect(json.photoAsk.reason).toBe("people");
    expect(부른라우트).toEqual([]);
  });

  /** Review Focus 1 — 목록 밖 id 로 고른 값은 안 먹힌다. */
  it("남의 사진 id 로 고른 값은 버린다", async () => {
    역할판단 = 역할(["unclear", false]);
    const { json } = await 보낸다({ referenceIds: [사진(1)], photoRoles: [{ id: 사진(9), role: "preserve_product" }] });

    expect(json.photoAsk.reason).toBe("unclear");
  });
});

describe("값이 나가기 전에 멈춘다 (설계 §2-6 ⓒ)", () => {
  it("장수가 넘치면 읽기 · 판단 · 라우트를 하나도 안 부른다", async () => {
    볼수있는사진 = Array.from({ length: 8 }, (_, i) => 사진(i + 1));
    const { status, json } = await 보낸다({ imageModel: "nano-banana", referenceIds: 볼수있는사진 });

    expect(status).toBe(400);
    expect(json.retryable).toBe(false);
    expect(json.message).toContain("7장");
    expect(읽은사진).toEqual([]);
    expect(부른횟수.roles).toBe(0);
    expect(부른라우트).toEqual([]);
  });

  /** Review Focus 4 */
  it("역할 판단이 실패하면 아무것도 안 남기고 실패를 알린다", async () => {
    역할판단실패 = new Error("판단 실패");
    const { status } = await 보낸다({ referenceIds: [사진(1)] });

    expect(status).toBe(500);
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });
});

describe("역할대로 칸을 채운다 (설계 §2-6)", () => {
  it("붙인 순서로 칸을 채우고, 말이 역할과 맞으면 말을 보낸다", async () => {
    const 말 = "2번 제품 그대로, 3번 사람은 그림체만 바꿔";
    역할판단 = 역할(["style", false], ["preserve_product", true], ["preserve_person_restyled", true]);
    await 보낸다({ prompt: 말, referenceIds: [사진(1), 사진(2), 사진(3)] });

    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
    expect(부른라우트[0]!.body).toMatchObject({
      referenceIds: [사진(1)],
      preservedIds: [사진(2), 사진(3)],
      personIds: [사진(3)],
      restyledIds: [사진(3)],
      attachmentOrder: [사진(1), 사진(2), 사진(3)],
      attachmentIntent: 말,
    });
  });

  it("모두 단추로 골랐으면 사진을 안 읽는다", async () => {
    역할판단 = { photos: [], conflicting: false };
    await 보낸다({ referenceIds: [사진(1)], photoRoles: [{ id: 사진(1), role: "style" }] });

    expect(읽은사진).toEqual([]);
    expect(부른횟수.roles).toBe(1);
    expect(부른라우트[0]!.body).toMatchObject({ referenceIds: [사진(1)] });
  });

  it("단추가 말을 뒤집으면 말을 그림 모델에 안 보낸다", async () => {
    역할판단 = 역할(["preserve_product", true]);
    await 보낸다({ prompt: "1번 제품은 그대로", referenceIds: [사진(1)], photoRoles: [{ id: 사진(1), role: "style" }] });

    expect(부른라우트[0]!.body).toMatchObject({ referenceIds: [사진(1)], preservedIds: [], attachmentIntent: "" });
  });

  /** §2-1 — 붙인 수에 personIds 를 한 번 더 더하던 것. 이제 서로 다른 사진 수다. */
  it("같은 사진을 두 번 붙여도 한 장이다", async () => {
    역할판단 = 역할(["style", false]);
    await 보낸다({ referenceIds: [사진(1), 사진(1)] });

    expect(부른라우트[0]!.body).toMatchObject({ attachmentOrder: [사진(1)] });
  });
});
