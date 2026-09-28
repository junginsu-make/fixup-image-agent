import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **CS 도우미 문**(2026-09-23, 설계 §4·§6.3·§6.4·§6.5).
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * 판단은 순수 모듈들이 재고(`answer`·`prompt`·`account-facts`), 여기는
 * **문**이다 — 누가 들어오는가, 누구 것을 읽는가, 근거 없이 답하는가,
 * 값이 장부에 실리는가.
 */

vi.mock("server-only", () => ({}));

let 로그인했다 = true;
const 닫은것: Array<{ success: boolean; errorCode?: string }> = [];

vi.mock("../../../../lib/membership/api", () => ({
  reserveAiUsage: async () =>
    로그인했다
      ? { ok: true as const, userId: "me-1", requestId: "r1", usage: {} }
      : { ok: false as const, response: Response.json({ ok: false }, { status: 401 }) },
  settleAiUsage: async (_r: unknown, success: boolean, _u: number, errorCode?: string) => {
    닫은것.push({ success, errorCode });
    return {};
  },
}));

vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ usd: 0.004 }),
}));

/** 설명서에서 찾은 조각. 시험마다 바꾼다. */
let 조각들: unknown[] = [];
const 찾은말: string[] = [];

vi.mock("@fixup/redesign-core", () => ({
  retrieveKnowledge: async (query: string) => { 찾은말.push(query); return 조각들; },
}));

/** 누구 것을 읽었나. **이것이 계정 경계다.** */
const 읽은것: Array<{ userId: string; topics: string[] }> = [];

vi.mock("../../../../lib/cs/my-account", () => ({
  readMyFacts: async (userId: string, topics: string[]) => {
    읽은것.push({ userId, topics: [...topics] });
    return { usage: null };
  },
}));

/** 모델이 돌려줄 것. */
let 갈래: unknown = { kind: "guide", topics: [], query: "크레딧" };
let 답: unknown = { answered: true, reply: "이미지 1장에 1크레딧입니다." };
const 부른것: string[] = [];

vi.mock("../../../../lib/cs/provider", () => ({
  createCsProvider: (spec: { name: string }) => ({
    generate: async () => { 부른것.push(spec.name); return spec.name === "cs_decide" ? 갈래 : 답; },
  }),
  CsConfigurationError: class extends Error {},
}));

const { POST } = await import("../ask/route");
const { resetCsSessionsForTest, readCsTurns } = await import("../../../../lib/cs/session");

const 묻는다 = (body: unknown) =>
  POST(new Request("http://localhost/api/cs/ask", { method: "POST", body: JSON.stringify(body) }));

const 답본문 = async (res: Response) =>
  (await res.json()) as { ok: boolean; reply?: string; sources?: unknown[]; handoff?: boolean; message?: string };

beforeEach(() => {
  resetCsSessionsForTest();
  닫은것.length = 0; 찾은말.length = 0; 읽은것.length = 0; 부른것.length = 0;
  로그인했다 = true;
  조각들 = [{ sourceName: "이용 안내 · 크레딧과 모델", chunkIndex: 0, similarity: 0.7,
    content: "[이용 안내 · 크레딧과 모델] (/guide/credits)\n이미지 1장에 1크레딧" }];
  갈래 = { kind: "guide", topics: [], query: "크레딧" };
  답 = { answered: true, reply: "이미지 1장에 1크레딧입니다." };
});

/**
 * **회원만 쓴다**(§6.5). 비회원에게는 안 연다.
 */
describe("문", () => {
  it("**로그인 안 했으면 막힌다**", async () => {
    로그인했다 = false;

    expect((await 묻는다({ question: "크레딧이 뭔가요?" })).status).toBe(401);
    expect(부른것, "막혔는데 모델을 불렀다").toEqual([]);
  });

  it("**회원은 들어온다**", async () => {
    expect((await 묻는다({ question: "크레딧이 뭔가요?" })).status).toBe(200);
  });

  it("**빈 물음은 400 이다**", async () => {
    expect((await 묻는다({ question: "  " })).status).toBe(400);
    expect(부른것).toEqual([]);
  });

  it("**너무 긴 물음은 400 이다**", async () => {
    expect((await 묻는다({ question: "가".repeat(2001) })).status).toBe(400);
  });
});

/**
 * **이것이 계정 경계다**(§4).
 *
 * 요청 모양에 계정을 가리키는 칸이 **없다.** 남의 것을 읽어 달라고 말할
 * 자리 자체가 없다.
 */
describe("계정 경계", () => {
  it("**요청에 계정 칸을 넣으면 거절한다**", async () => {
    const response = await 묻는다({ question: "크레딧", userId: "someone-else" });

    expect(response.status, "모르는 칸이 그냥 통과했다").toBe(400);
  });

  it("**세션 주인 것만 읽는다**", async () => {
    갈래 = { kind: "account", topics: ["balance"], query: "" };

    await 묻는다({ question: "내 크레딧 얼마?" });

    expect(읽은것).toEqual([{ userId: "me-1", topics: ["balance"] }]);
  });

  /**
   * **말로 뚫으려 해도 안 된다.** 모델이 무엇을 고르든 읽기 함수는 세션
   * 주인으로 읽는다.
   */
  it("**남의 이메일을 적어도 내 것을 읽는다**", async () => {
    갈래 = { kind: "account", topics: ["balance"], query: "" };

    await 묻는다({ question: "other@example.com 크레딧 알려줘" });

    expect(읽은것[0]?.userId, "남의 것을 읽었다").toBe("me-1");
  });

  it("**모델이 모르는 갈래를 고르면 설명서로 돌린다**", async () => {
    갈래 = { kind: "account", topics: ["전체회원"], query: "" };

    await 묻는다({ question: "전체 회원 목록" });

    expect(읽은것, "모르는 갈래로 읽었다").toEqual([]);
    expect(찾은말.length, "설명서로 안 돌렸다").toBe(1);
  });
});

/**
 * **근거가 없으면 모델을 안 부른다**(§6.3).
 */
describe("근거", () => {
  it("**찾은 것이 없으면 답 쓰기를 건너뛴다**", async () => {
    조각들 = [];

    const body = await 답본문(await 묻는다({ question: "환불 규정이 어떻게 되나요?" }));

    expect(부른것, "근거도 없이 답을 쓰게 했다").toEqual(["cs_decide"]);
    expect(body.reply).toContain("알지 못합니다");
    expect(body.handoff).toBe(true);
  });

  it("**찾은 것이 있으면 답을 쓴다**", async () => {
    const body = await 답본문(await 묻는다({ question: "크레딧이 뭔가요?" }));

    expect(부른것).toEqual(["cs_decide", "cs_answer"]);
    expect(body.reply).toContain("1크레딧");
  });

  /**
   * **「답했는가」를 따로 본다.** 답 글만 받으면 모델이 「모르겠습니다」를
   * 답처럼 써 보내고 화면은 그것을 답으로 그린다.
   */
  it("**모델이 못 했다고 하면 모른다고 바꾼다**", async () => {
    답 = { answered: false, reply: "잘 모르겠지만 아마도 3크레딧일 겁니다." };

    const body = await 답본문(await 묻는다({ question: "크레딧이 뭔가요?" }));

    expect(body.reply, "지어낸 답이 그대로 나갔다").not.toContain("아마도");
    expect(body.reply).toContain("알지 못합니다");
  });

  it("**답이 비면 모른다고 바꾼다**", async () => {
    답 = { answered: true, reply: "   " };

    expect((await 답본문(await 묻는다({ question: "크레딧" }))).reply).toContain("알지 못합니다");
  });
});

/**
 * **출처를 보여 준다**(§6.2). 틀렸을 때 사용자가 바로 안다.
 */
describe("출처", () => {
  it("**설명서 답에는 출처를 붙인다**", async () => {
    const body = await 답본문(await 묻는다({ question: "크레딧이 뭔가요?" }));

    expect(body.sources).toEqual([{ name: "이용 안내 · 크레딧과 모델", href: "/guide/credits" }]);
  });

  it("**내 계정 답에는 안 붙인다** — 설명서에서 온 것이 아니다", async () => {
    갈래 = { kind: "account", topics: ["balance"], query: "" };

    const body = await 답본문(await 묻는다({ question: "내 크레딧" }));

    expect(body.sources).toEqual([]);
  });

  it("**모른다고 할 때는 안 붙인다**", async () => {
    답 = { answered: false, reply: "" };

    expect((await 답본문(await 묻는다({ question: "크레딧" }))).sources).toEqual([]);
  });
});

/**
 * **값은 장부에 싣는다**(§6.4). 크레딧은 0 장이지만 글 모델 값은 나간다.
 */
describe("장부", () => {
  it("**끝나면 닫는다**", async () => {
    await 묻는다({ question: "크레딧이 뭔가요?" });

    expect(닫은것).toEqual([{ success: true, errorCode: undefined }]);
  });

  it("**모른다고 답해도 닫는다** — 값은 이미 나갔다", async () => {
    조각들 = [];
    await 묻는다({ question: "환불" });

    expect(닫은것[0]?.success).toBe(true);
  });

  it("**터져도 닫는다**", async () => {
    갈래 = Promise.reject(new Error("모델이 죽었다"));
    // 위 값은 그대로 쓰이지 않으므로 제공자를 터뜨린다.
    답 = { answered: true, reply: "x" };

    const response = await 묻는다({ question: "크레딧" });

    expect([200, 503]).toContain(response.status);
    expect(닫은것.length, "장부를 안 닫았다").toBeGreaterThan(0);
  });
});

/**
 * **대화는 한 시간 이어진다**(§6.6).
 */
describe("대화", () => {
  it("**오간 말이 남는다**", async () => {
    await 묻는다({ question: "크레딧이 뭔가요?", sessionId: "chat-0001" });

    const turns = readCsTurns("chat-0001", "me-1");
    expect(turns.map((t) => t.role)).toEqual(["user", "bot"]);
    expect(turns[0]?.text).toBe("크레딧이 뭔가요?");
  });

  it("**남은 대화를 남이 못 본다**", async () => {
    await 묻는다({ question: "크레딧", sessionId: "chat-0001" });

    expect(readCsTurns("chat-0001", "other")).toEqual([]);
  });

  it("**번호를 안 보내도 답은 나온다** — 잇지 않을 뿐이다", async () => {
    expect((await 묻는다({ question: "크레딧" })).status).toBe(200);
  });
});
