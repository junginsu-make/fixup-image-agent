import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **예상 못 한 오류의 원문을 화면에 보내지 않는다**(2026-10-07 후속 Task 1). 저장소가 던지는
 * Supabase 글(표 이름 · 정책 이름)은 서버 기록에만 남기고, 화면에는 라우트의 일반 문장을
 * 지금과 같은 500 으로 준다. 우리가 쓴 「대화를 찾을 수 없습니다.」(404)는 그대로다.
 */

vi.mock("server-only", () => ({}));

const 날것 = new Error('대화 목록: relation "easy_conversations" does not exist');
let 던짐: Error | null;
let 있는대화: boolean;
let 지웠나: boolean;

const 던지거나 = <T>(value: T) => async () => {
  if (던짐) throw 던짐;
  return value;
};

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1" } }),
}));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    listConversations: 던지거나([]),
    createConversation: 던지거나({ id: "c1", title: "" }),
    getConversation: async () => {
      if (던짐) throw 던짐;
      return 있는대화 ? { id: "c1", title: "있음" } : undefined;
    },
    listMessages: 던지거나([]),
    removeConversation: async () => {
      if (던짐) throw 던짐;
      return 지웠나;
    },
  }),
}));

const 목록 = await import("../conversations/route");
const 하나 = await import("../conversations/[id]/route");

const 맥락 = { params: Promise.resolve({ id: "c1" }) };
const 읽는다 = async (response: Response) => ({ status: response.status, json: await response.json() });

beforeEach(() => {
  던짐 = null;
  있는대화 = true;
  지웠나 = true;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("대화 목록 · 만들기 (후속 Task 1)", () => {
  it("목록 읽기가 날것 오류로 실패하면 일반 문장을 500 으로 주고 원문은 서버 기록에 남긴다", async () => {
    const 기록 = vi.spyOn(console, "error").mockImplementation(() => {});
    던짐 = 날것;
    const { status, json } = await 읽는다(await 목록.GET());
    expect(status).toBe(500);
    expect(json).toEqual({ ok: false, message: "대화 목록을 읽지 못했습니다." });
    expect(기록).toHaveBeenCalledWith(expect.stringContaining("[easy]"), 날것);
  });

  it("만들기가 날것 오류로 실패해도 원문을 싣지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    던짐 = 날것;
    const { status, json } = await 읽는다(await 목록.POST(new Request("http://localhost/api/easy/conversations", {
      method: "POST", body: JSON.stringify({ title: "새 대화" }),
    })));
    expect(status).toBe(500);
    expect(json).toEqual({ ok: false, message: "대화를 만들지 못했습니다." });
  });

  it("성공은 지금 그대로다", async () => {
    expect(await 읽는다(await 목록.GET())).toEqual({ status: 200, json: { ok: true, conversations: [] } });
  });
});

describe("대화 하나 (후속 Task 1)", () => {
  it("읽기가 날것 오류로 실패하면 일반 문장을 500 으로 준다", async () => {
    const 기록 = vi.spyOn(console, "error").mockImplementation(() => {});
    던짐 = 날것;
    const { status, json } = await 읽는다(await 하나.GET(new Request("http://localhost"), 맥락));
    expect(status).toBe(500);
    expect(json).toEqual({ ok: false, message: "대화를 읽지 못했습니다." });
    expect(기록).toHaveBeenCalledWith(expect.stringContaining("[easy]"), 날것);
  });

  it("지우기가 날것 오류로 실패하면 일반 문장을 500 으로 준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    던짐 = 날것;
    const { status, json } = await 읽는다(await 하나.DELETE(new Request("http://localhost"), 맥락));
    expect(status).toBe(500);
    expect(json).toEqual({ ok: false, message: "대화를 지우지 못했습니다." });
  });

  it("없는 대화는 「대화를 찾을 수 없습니다.」를 404 로 그대로 준다 (읽기 · 지우기)", async () => {
    있는대화 = false;
    지웠나 = false;
    const 없음 = { status: 404, json: { ok: false, message: "대화를 찾을 수 없습니다." } };
    expect(await 읽는다(await 하나.GET(new Request("http://localhost"), 맥락))).toEqual(없음);
    expect(await 읽는다(await 하나.DELETE(new Request("http://localhost"), 맥락))).toEqual(없음);
  });
});
