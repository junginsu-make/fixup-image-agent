import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **문의 남기기**(2026-09-23 사용자 결정, 설계 §10).
 *
 * > 직접 문의를 원할 경우에는 관리자화면에 문의 내용과 로그를 기록하게 하고,
 * > ai.dev@fixupworld.com 으로 메일을 받을 수 있게 하세요.
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * 셋이다.
 *   ① **회원만** 남길 수 있다
 *   ② **표에 먼저** 넣고 그다음 메일 — 메일이 죽어도 문의는 안 사라진다
 *   ③ 대화는 **서버 것을 쓴다** — 화면이 보낸 것을 믿지 않는다
 */

vi.mock("server-only", () => ({}));

let 로그인했다 = true;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () =>
    로그인했다
      ? { ok: true as const, member: { userId: "me-1", profile: { id: "me-1", email: "me@example.com" } } }
      : { ok: false as const, response: Response.json({ ok: false }, { status: 401 }) },
}));

/** 무슨 일이 어떤 순서로 있었나. **순서가 이 파일의 핵심이다.** */
const 한일: string[] = [];
/** 표에 들어간 줄. */
let 넣은줄: Record<string, unknown> | null = null;
/** 표가 받아 주나. */
let 표가된다 = true;
/** `mailed_at` 을 찍었나. */
const 찍은것: Array<Record<string, unknown>> = [];

/** 최근 한 시간 안에 남긴 문의. 같은 물음·시간당 한도 검사가 이것을 읽는다. */
let 최근것: Array<{ question: string }> | null = [];

vi.mock("../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: (_columns: string) => ({
        eq: () => ({
          gte: async () => {
            한일.push("select");
            return 최근것 ? { data: 최근것, error: null } : { data: null, error: { message: "없는 표" } };
          },
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        한일.push("insert");
        넣은줄 = row;
        return {
          select: () => ({
            single: async () =>
              표가된다
                ? { data: { id: "inq-1" }, error: null }
                : { data: null, error: { message: "표가 없다" } },
          }),
        };
      },
      update: (patch: Record<string, unknown>) => {
        한일.push("update");
        찍은것.push(patch);
        return { eq: async () => (갱신된다 ? { error: null } : { error: { message: "못 적었다" } }) };
      },
    }),
  }),
}));

/** `mailed_at` 갱신이 되나. 안 되면 조용히 넘기지 말아야 한다. */
let 갱신된다 = true;

/** 메일이 나가나. */
let 메일된다 = true;
const 보낸메일: Array<Record<string, unknown>> = [];

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (mail: Record<string, unknown>) => {
        한일.push("sendMail");
        if (!메일된다) throw new Error("SMTP 가 죽었다");
        보낸메일.push(mail);
        return {};
      },
    }),
  },
}));

const { POST } = await import("../inquiry/route");
const { resetCsSessionsForTest, appendCsTurns } = await import("../../../../lib/cs/session");

const 남긴다 = (body: unknown) =>
  POST(new Request("http://localhost/api/cs/inquiry", { method: "POST", body: JSON.stringify(body) }));

const 본문 = async (res: Response) =>
  (await res.json()) as { ok: boolean; saved?: boolean; mailed?: boolean; message?: string };

beforeEach(() => {
  resetCsSessionsForTest();
  한일.length = 0; 찍은것.length = 0; 보낸메일.length = 0;
  넣은줄 = null;
  로그인했다 = true; 표가된다 = true; 메일된다 = true; 갱신된다 = true;
  최근것 = [];
  delete process.env.CS_INQUIRY_HOURLY_LIMIT;
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_USER = "bot@example.com";
  process.env.SMTP_PASS = "x";
  delete process.env.CS_INQUIRY_EMAIL;
});

describe("문", () => {
  it("**로그인 안 했으면 막힌다**", async () => {
    로그인했다 = false;

    expect((await 남긴다({ question: "결제가 안 돼요" })).status).toBe(401);
    expect(한일, "막혔는데 표를 건드렸다").toEqual([]);
  });

  it("**회원은 남길 수 있다**", async () => {
    expect((await 남긴다({ question: "결제가 안 돼요" })).status).toBe(200);
  });

  it("**빈 물음은 400 이다**", async () => {
    expect((await 남긴다({ question: "   " })).status).toBe(400);
    expect(한일).toEqual([]);
  });

  it("**모르는 칸을 넣으면 거절한다**", async () => {
    expect((await 남긴다({ question: "결제", userId: "someone-else" })).status).toBe(400);
  });

  /**
   * **근거를 화면이 정하지 못한다.** 그 주소는 관리자 화면에서 눌리는
   * 링크가 되므로, 화면이 보내게 하면 회원이 관리자에게 링크를 먹인다.
   */
  it("**화면이 근거를 보내면 거절한다**", async () => {
    const response = await 남긴다({
      question: "결제",
      sources: [{ name: "누른다", href: "javascript:alert(1)" }],
    });

    expect(response.status, "화면이 보낸 근거가 그냥 통과했다").toBe(400);
    expect(한일).toEqual([]);
  });
});

/**
 * **순서가 중요하다**(설계 §10). 메일 발송 실패가 문의 접수를 막으면 안 된다.
 */
describe("순서", () => {
  it("**표에 먼저 넣고 그다음 보낸다**", async () => {
    await 남긴다({ question: "결제가 안 돼요" });

    expect(한일.indexOf("insert"), "메일을 먼저 보냈다").toBeLessThan(한일.indexOf("sendMail"));
  });

  it("**메일이 죽어도 문의는 접수된다**", async () => {
    메일된다 = false;

    const body = await 본문(await 남긴다({ question: "결제가 안 돼요" }));

    expect(body.ok, "메일 때문에 문의를 버렸다").toBe(true);
    expect(body.saved).toBe(true);
    expect(body.mailed).toBe(false);
    expect(찍은것, "못 보냈는데 보낸 것으로 찍었다").toEqual([]);
  });

  it("**보냈으면 보낸 때를 찍는다**", async () => {
    await 남긴다({ question: "결제가 안 돼요" });

    expect(찍은것.length).toBe(1);
    expect(찍은것[0]).toHaveProperty("mailed_at");
  });

  /**
   * **이 실패를 조용히 넘기면 거짓이 남는다**(2026-09-28 독립 검토).
   * `mailed_at` 이 빈 채 남으면 관리자 화면이 「메일 못 보냄」을 붙이고,
   * 담당자는 이미 받은 메일을 못 받은 것으로 읽는다.
   */
  it("**보낸 때를 못 적으면 적어 둔다**", async () => {
    갱신된다 = false;
    const 적힌것: unknown[] = [];
    const 원래 = console.warn;
    console.warn = (...args: unknown[]) => { 적힌것.push(args); };

    try {
      const body = await 본문(await 남긴다({ question: "결제가 안 돼요" }));
      // 문의는 이미 접수됐다. 메일도 실제로 갔다. 응답은 그대로 둔다.
      expect(body.ok).toBe(true);
      expect(body.mailed).toBe(true);
    } finally {
      console.warn = 원래;
    }

    expect(적힌것.length, "조용히 넘어갔다").toBe(1);
  });

  it("**표가 안 되면 메일도 안 보낸다** — 번호 없는 문의는 쫓을 수 없다", async () => {
    표가된다 = false;

    const response = await 남긴다({ question: "결제가 안 돼요" });

    expect((await 본문(response)).ok).toBe(false);
    expect(한일, "표에 못 넣고 메일을 보냈다").toEqual(["select", "insert"]);
  });
});

/**
 * **대화는 서버 것을 쓴다.** 화면이 통째로 보내게 하면 아무 글이나
 * 「내 대화」로 넣을 수 있다.
 */
describe("대화", () => {
  it("**서버가 들고 있는 대화를 싣는다**", async () => {
    appendCsTurns("chat-0001", "me-1", [
      { role: "user", text: "결제가 안 됩니다" },
      { role: "bot", text: "이건 담당자가 봐야 합니다" },
    ]);

    await 남긴다({ question: "결제가 안 돼요", sessionId: "chat-0001" });

    const 대화 = (넣은줄?.transcript ?? []) as Array<{ text: string }>;
    expect(대화.map((t) => t.text)).toEqual(["결제가 안 됩니다", "이건 담당자가 봐야 합니다"]);
  });

  it("**근거는 서버가 들고 있는 것을 쓴다**", async () => {
    appendCsTurns("chat-0001", "me-1", [
      { role: "user", text: "크레딧이 뭔가요?" },
      { role: "bot", text: "1장에 1크레딧입니다", sources: [{ name: "이용 안내", href: "/guide/credits" }] },
      { role: "user", text: "환불은요?" },
      { role: "bot", text: "제가 알지 못합니다", sources: [] },
    ]);

    await 남긴다({ question: "환불은요?", sessionId: "chat-0001" });

    /*
      **마지막 답의 근거를 쓴다.** 문의는 답을 못 받아서 남기는 것이므로,
      바로 앞의 답이 무엇을 못 찾았는지가 담당자에게 필요한 것이다.
    */
    expect(넣은줄?.evidence, "옛 답의 근거를 실었다").toEqual([]);
  });

  it("**찾은 근거가 있으면 그것을 싣는다**", async () => {
    appendCsTurns("chat-0001", "me-1", [
      { role: "user", text: "크레딧이 뭔가요?" },
      { role: "bot", text: "1장에 1크레딧입니다", sources: [{ name: "이용 안내", href: "/guide/credits" }] },
    ]);

    await 남긴다({ question: "더 자세히 알려 주세요", sessionId: "chat-0001" });

    expect(넣은줄?.evidence).toEqual([{ name: "이용 안내", href: "/guide/credits" }]);
    /*
      **근거는 한 군데에만 있다.** 대화에도 넣으면 같은 주소가 두 군데 남아
      나중에 어느 쪽이 참인지 헷갈린다.
    */
    expect(넣은줄?.transcript, "근거가 대화에도 들어갔다")
      .toEqual([{ role: "user", text: "크레딧이 뭔가요?" }, { role: "bot", text: "1장에 1크레딧입니다" }]);
  });

  /**
   * **물은 그 물음의 답에서 근거를 뽑는다**(2026-09-28 독립 검토).
   *
   * 화면은 답마다 「문의 남기기」를 붙인다. 못 받은 답 뒤로 더 물었는데
   * 마지막 답의 근거를 달면, 구멍이 있는 문의가 **근거를 찾은 문의로**
   * 기록된다 — 설계 §10.1 이 이 칸을 둔 까닭이 거짓이 된다.
   */
  it("**뒤에 더 물었어도 그 물음의 답을 본다**", async () => {
    appendCsTurns("chat-0001", "me-1", [
      { role: "user", text: "환불은요?" },
      { role: "bot", text: "제가 알지 못합니다", sources: [] },
      { role: "user", text: "크레딧이 뭔가요?" },
      { role: "bot", text: "1장에 1크레딧입니다", sources: [{ name: "이용 안내", href: "/guide/credits" }] },
    ]);

    await 남긴다({ question: "환불은요?", sessionId: "chat-0001" });

    expect(넣은줄?.evidence, "못 찾은 물음인데 근거가 실렸다").toEqual([]);
  });

  it("**같은 말을 두 번 물었으면 나중 것이다**", async () => {
    appendCsTurns("chat-0001", "me-1", [
      { role: "user", text: "환불은요?" },
      { role: "bot", text: "이용 안내를 보세요", sources: [{ name: "옛 문서", href: "/guide/old" }] },
      { role: "user", text: "환불은요?" },
      { role: "bot", text: "제가 알지 못합니다", sources: [] },
    ]);

    await 남긴다({ question: "환불은요?", sessionId: "chat-0001" });

    expect(넣은줄?.evidence, "옛 답의 근거를 실었다").toEqual([]);
  });

  it("**대화에 없는 물음이면 마지막 답으로 돌아간다**", async () => {
    appendCsTurns("chat-0001", "me-1", [
      { role: "user", text: "크레딧이 뭔가요?" },
      { role: "bot", text: "1장에 1크레딧입니다", sources: [{ name: "이용 안내", href: "/guide/credits" }] },
    ]);

    await 남긴다({ question: "직접 적은 다른 물음", sessionId: "chat-0001" });

    expect(넣은줄?.evidence).toEqual([{ name: "이용 안내", href: "/guide/credits" }]);
  });

  it("**남의 대화는 안 실린다**", async () => {
    appendCsTurns("chat-0001", "other", [{ role: "user", text: "남의 비밀" }]);

    await 남긴다({ question: "결제", sessionId: "chat-0001" });

    expect(넣은줄?.transcript, "남의 대화가 실렸다").toEqual([]);
    expect(넣은줄?.evidence, "남의 근거가 실렸다").toEqual([]);
  });
});

/**
 * **막는 것이 있어야 한다**(2026-09-28 독립 검토).
 *
 * 이 라우트는 일부러 사용량 예약을 안 쓴다. 그래서 `reserve_generation` 의
 * 시간당 셈이 안 걸리고, 표에서 직접 봐야 한다.
 */
describe("조임", () => {
  it("**같은 물음은 한 번만 남는다**", async () => {
    최근것 = [{ question: "결제가 안 돼요" }];

    const body = await 본문(await 남긴다({ question: "결제가 안 돼요" }));

    expect(body.ok, "사용자에게는 받은 것이 맞다").toBe(true);
    expect(body.saved).toBe(false);
    expect(한일, "같은 물음으로 줄이 또 생겼다").toEqual(["select"]);
  });

  it("**다른 물음은 남는다**", async () => {
    최근것 = [{ question: "결제가 안 돼요" }];

    await 남긴다({ question: "환불은 어떻게 하나요?" });

    expect(한일).toContain("insert");
  });

  it("**한 시간에 열 건까지다**", async () => {
    최근것 = Array.from({ length: 10 }, (_, i) => ({ question: `물음 ${i}` }));

    const body = await 본문(await 남긴다({ question: "열한 번째" }));

    expect(body.ok).toBe(false);
    expect(body.message).toContain("10건까지");
    expect(한일, "한도를 넘었는데 넣었다").toEqual(["select"]);
  });

  it("**아홉 건이면 아직 받는다**", async () => {
    최근것 = Array.from({ length: 9 }, (_, i) => ({ question: `물음 ${i}` }));

    expect((await 본문(await 남긴다({ question: "열 번째" }))).ok).toBe(true);
    expect(한일).toContain("insert");
  });

  it("**환경변수로 한도를 바꾼다**", async () => {
    process.env.CS_INQUIRY_HOURLY_LIMIT = "2";
    최근것 = [{ question: "가" }, { question: "나" }];

    expect((await 본문(await 남긴다({ question: "다" }))).message).toContain("2건까지");
  });

  it("**빈 글자는 기본값으로 본다** — 0 으로 읽으면 다 막힌다", async () => {
    process.env.CS_INQUIRY_HOURLY_LIMIT = "";
    최근것 = [{ question: "가" }];

    expect((await 본문(await 남긴다({ question: "나" }))).ok, "아무도 문의를 못 남긴다").toBe(true);
  });

  /**
   * **검사가 안 되면 통과시킨다.** 이 검사는 편의이고 문의를 남기는 것이
   * 목적이다 — 마이그레이션 전 서버에서 문의를 통째로 버리면 안 된다.
   */
  it("**최근 것을 못 읽으면 그냥 받는다**", async () => {
    최근것 = null;

    expect((await 본문(await 남긴다({ question: "결제가 안 돼요" }))).ok).toBe(true);
    expect(한일).toContain("insert");
  });
});

describe("메일", () => {
  it("**기본 받는 곳은 담당자 주소다**", async () => {
    await 남긴다({ question: "결제가 안 돼요" });

    expect(보낸메일[0]?.to).toBe("ai.dev@fixupworld.com");
  });

  it("**환경변수로 받는 곳을 바꿀 수 있다**", async () => {
    process.env.CS_INQUIRY_EMAIL = "cs@example.com";

    await 남긴다({ question: "결제가 안 돼요" });

    expect(보낸메일[0]?.to).toBe("cs@example.com");
  });

  it("**답장하면 물어본 사람에게 간다**", async () => {
    await 남긴다({ question: "결제가 안 돼요" });

    expect(보낸메일[0]?.replyTo, "답장이 물어본 사람에게 안 간다").toBe("me@example.com");
  });

  it("**근거를 못 찾았으면 그렇게 적는다** — 설명서 구멍의 표시다", async () => {
    appendCsTurns("chat-0001", "me-1", [
      { role: "user", text: "환불은 어떻게 하나요?" },
      { role: "bot", text: "제가 알지 못합니다", sources: [] },
    ]);

    await 남긴다({ question: "환불은 어떻게 하나요?", sessionId: "chat-0001" });

    expect(String(보낸메일[0]?.text)).toContain("근거를 찾지 못했습니다");
  });

  /**
   * **모르는 것과 못 찾은 것을 가른다.** 대화가 지워진 뒤 남긴 문의를
   * 「설명서에 없다」로 적으면 없는 구멍을 좇게 된다.
   */
  it("**대화가 없으면 알 수 없다고 적는다**", async () => {
    await 남긴다({ question: "환불은 어떻게 하나요?" });

    const 본문글 = String(보낸메일[0]?.text);
    expect(본문글).toContain("대화가 남아 있지 않아");
    expect(본문글, "구멍이 아닌데 구멍이라고 적었다").not.toContain("근거를 찾지 못했습니다");
  });

  it("**SMTP 설정이 없으면 보내려 들지 않는다**", async () => {
    delete process.env.SMTP_HOST;

    const body = await 본문(await 남긴다({ question: "결제" }));

    expect(한일, "설정도 없이 보내려 했다").toEqual(["select", "insert"]);
    expect(body.ok, "설정이 없다고 문의를 버렸다").toBe(true);
    expect(body.mailed).toBe(false);
  });
});
