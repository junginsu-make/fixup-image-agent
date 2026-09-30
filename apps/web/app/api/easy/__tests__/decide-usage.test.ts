import { beforeEach, describe, expect, it, vi } from "vitest";
import { stepIdempotencyKey } from "../../../../lib/easy/step-key";

/**
 * **판정도 값이 나간다 — 예약부터**(설계 2026-09-30 §3.1).
 *
 * 쉬운 만들기는 친 말이 주문인지 대화인지를 글 모델에게 먼저 묻는다. 그 한 번이
 * 예약 없이 돌아서, 크레딧이 없어도 운영자가 멈춰도 돌았다. 이제 `poster_image` +
 * `easy:decide`(0 크레딧)로 잡고, 되묻기·대화·주문·실패 — **모든 끝에서 닫는다.**
 * 열쇠는 단계마다 가른다(`step-key.ts`) — 바깥 열쇠를 그대로 쓰면 뒤의 기획·생성
 * 예약이 `duplicate_request` 로 막힌다.
 */
vi.mock("server-only", () => ({}));

const KEY = "22222222-2222-4222-8222-222222222222";
const order: string[] = [];
const reserveCalls: Array<{ key: string | null; operation: string; units: number; resource?: string }> = [];
const settleCalls: Array<{ success: boolean; units: number; code?: string }> = [];
let reserveOk = true;
let decideRaw: unknown = { wants: "talk", reply: "안녕하세요" };
let decideThrows: Error | null = null;
let 정산결과: unknown = { remaining: 0 };
let planReply: () => Response = () => Response.json({ ok: true });

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async (request: Request, operation: string, units: number, plan?: { resource: string }) => {
    order.push("reserve");
    reserveCalls.push({ key: request.headers.get("x-idempotency-key"), operation, units, resource: plan?.resource });
    return reserveOk
      ? { ok: true as const, userId: "u1", requestId: "decide-request", usage: undefined }
      : {
          ok: false as const,
          response: Response.json(
            { ok: false, code: "credits_required", message: "크레딧이 없어 이 기능을 쓸 수 없습니다.", retryable: false },
            { status: 403 },
          ),
        };
  },
  settleAiUsage: async (_reservation: unknown, success: boolean, units: number, code?: string) => {
    order.push("settle");
    settleCalls.push({ success, units, code });
    return 정산결과;
  },
}));

vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "이미 있음" }),
    listMessages: async () => [],
    appendMessage: async (row: { role: string; body?: string }) => ({ id: `m-${row.role}`, ...row }),
    renameConversation: async () => undefined,
  }),
}));

vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async () => {
      order.push("decide");
      if (decideThrows) throw decideThrows;
      return decideRaw;
    },
  }),
}));

vi.mock("../../poster/projects/route", () => ({
  POST: async () => {
    order.push("project");
    return Response.json({ ok: true, project: { id: "p1" } });
  },
}));
vi.mock("../../poster/projects/[id]/plan/route", () => ({
  POST: async () => {
    order.push("plan");
    return planReply();
  },
}));
vi.mock("../../poster/projects/[id]/generate/route", () => ({
  POST: async () => {
    order.push("generate");
    return Response.json({ ok: true, submission: { requestId: "r1" } });
  },
}));

const { POST } = await import("../generate/route");

const call = (body: Record<string, unknown> = {}) =>
  POST(new Request("http://x/api/easy/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-idempotency-key": KEY },
    body: JSON.stringify({ conversationId: "c1", prompt: "안녕", ...body }),
  }));

beforeEach(() => {
  order.length = 0;
  reserveCalls.length = 0;
  settleCalls.length = 0;
  reserveOk = true;
  decideRaw = { wants: "talk", reply: "안녕하세요" };
  decideThrows = null;
  정산결과 = { remaining: 0 };
  planReply = () => Response.json({ ok: true });
});

describe("판정도 예약을 거친다", () => {
  it("판정 전에 단계 열쇠로 자리를 잡는다", async () => {
    await call();
    expect(order.slice(0, 2)).toEqual(["reserve", "decide"]);
    expect(reserveCalls[0]).toEqual({
      key: stepIdempotencyKey(KEY, "decide"), operation: "poster_image", units: 0, resource: "easy:decide",
    });
  });

  it("자리를 못 잡으면 판정을 부르지 않고, 다시 눌러도 안 풀린다고 알린다", async () => {
    reserveOk = false;
    const response = await call();
    expect(response.status).toBe(403);
    expect((await response.json()).retryable).toBe(false);
    expect(order).not.toContain("decide");
  });
});

describe("판정 예약은 모든 끝에서 닫는다", () => {
  it("대화로 끝나면 닫는다", async () => {
    decideRaw = { wants: "talk", reply: "네" };
    const body = await (await call()).json();
    expect(body.talked).toBe(true);
    expect(settleCalls).toEqual([{ success: true, units: 0, code: undefined }]);
  });

  it("되물으면 닫는다", async () => {
    decideRaw = { wants: "image" };
    const body = await (await call()).json();
    expect(body.asked).toBe(true);
    expect(settleCalls).toEqual([{ success: true, units: 0, code: undefined }]);
  });

  it("그림 주문이면 판정을 닫고 나서 기획·생성으로 간다", async () => {
    decideRaw = { wants: "image" };
    const body = await (await call({ referenceIds: ["r1"] })).json();
    expect(body.ok).toBe(true);
    expect(order).toEqual(["reserve", "decide", "settle", "project", "plan", "generate"]);
    expect(settleCalls).toHaveLength(1);
  });

  it("판정이 실패하면 실패로 닫는다", async () => {
    decideThrows = new Error("모델이 죽었다");
    const response = await call();
    expect(response.status).toBe(500);
    expect(settleCalls).toEqual([{ success: false, units: 0, code: "easy_decide_failed" }]);
  });

  it("정산이 못 닫혀도 답은 돌려준다", async () => {
    정산결과 = undefined;
    decideRaw = { wants: "talk", reply: "네" };
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).talked).toBe(true);
  });
});

describe("다시 눌러도 안 풀리는 실패", () => {
  it("안쪽 단계가 멈춤(503)으로 막히면 다시 시도를 안 낸다", async () => {
    decideRaw = { wants: "image" };
    planReply = () => Response.json(
      { ok: false, code: "ai_paused", message: "운영자가 AI 사용을 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.", retryable: false },
      { status: 503 },
    );
    const response = await call({ referenceIds: ["r1"] });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.retryable).toBe(false);
    expect(body.message).toBe("운영자가 AI 사용을 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("그냥 서버 오류(500)면 다시 시도를 낸다 — 예전 그대로", async () => {
    decideRaw = { wants: "image" };
    planReply = () => Response.json({ ok: false, message: "잠깐 실패" }, { status: 500 });
    const body = await (await call({ referenceIds: ["r1"] })).json();
    expect(body.retryable).toBe(true);
  });
});
