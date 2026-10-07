import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **비용 전략에서 누른 「저장」이 실제 구독 플랜을 바꾼다**(2026-09-23 요청).
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * 값을 옮기는 규칙은 `cost-plan-save.test.ts` 가 잰다. 여기는 **문**이다 —
 * 누가 들어올 수 있고, 무엇을 데이터베이스에 보내고, 반쯤 하다 멈추면
 * 뭐라고 말하는가.
 */

vi.mock("server-only", () => ({}));

let 역할 = "admin";
let 로그인했다 = true;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () =>
    로그인했다
      ? { ok: true, member: { userId: "admin-1", profile: { role: 역할 } } }
      : { ok: false, response: new Response("no", { status: 401 }) },
}));

/** 데이터베이스에 실제로 보낸 것. */
const 보낸것: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpc오류: string | null = null;
let 오류낼차례 = 0;
let 표읽기: { data: unknown; error: { message: string } | null } = { data: [], error: null };

vi.mock("../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      보낸것.push({ fn, args });
      const 이번차례 = 보낸것.length;
      return rpc오류 && 이번차례 === 오류낼차례 ? { error: { message: rpc오류 } } : { error: null };
    },
    from: () => ({ select: () => ({ order: async () => 표읽기 }) }),
  }),
}));

const { GET, POST } = await import("../cost-plans/route");
const { PLAN_DEFAULTS } = await import("../../../../lib/admin/cost-forecast/subscription-plans");

const 저장한다 = (plans: unknown = PLAN_DEFAULTS) =>
  POST(new Request("http://localhost/api/admin/cost-plans", { method: "POST", body: JSON.stringify({ plans }) }));

beforeEach(() => {
  보낸것.length = 0;
  역할 = "admin";
  로그인했다 = true;
  rpc오류 = null;
  오류낼차례 = 0;
  표읽기 = { data: [], error: null };
});

/**
 * **비용 전략은 관리자만이다**(2026-09-23 사용자: 「비용 플랜은 반드시
 * 마스터와 운영자만 접근 권한이 있어야 합니다」).
 *
 * 403 이 아니라 404 다 — 403 은 「여기 뭔가 있다」를 알려 준다. 문서를
 * 내주는 라우트와 같은 결이다.
 */
describe("문", () => {
  it("**로그인 안 했으면 못 들어온다**", async () => {
    로그인했다 = false;

    expect((await 저장한다()).status).toBe(404);
    expect(보낸것, "막혔는데 데이터베이스를 건드렸다").toEqual([]);
  });

  it("**관리자가 아니면 못 들어온다**", async () => {
    역할 = "member";

    expect((await 저장한다()).status).toBe(404);
    expect(보낸것, "막혔는데 데이터베이스를 건드렸다").toEqual([]);
  });

  it("**읽기도 막는다** — 가격·마진 전략이 그대로 보인다", async () => {
    역할 = "member";

    expect((await GET()).status).toBe(404);
  });

  it("**관리자는 들어온다**", async () => {
    expect((await 저장한다()).status).toBe(200);
  });
});

describe("무엇을 보내는가", () => {
  it("**플랜마다 한 번씩 보낸다**", async () => {
    await 저장한다();

    expect(보낸것.map(c => c.fn)).toEqual(["credit_admin_plan", "credit_admin_plan", "credit_admin_plan"]);
  });

  it("**크레딧과 고객 결제액을 보낸다**", async () => {
    await 저장한다();

    expect(보낸것.map(c => [c.args.p_id, c.args.p_units, c.args.p_price])).toEqual([
      ["basic", 75, 62_033], ["premium", 150, 109_074], ["ultra", 300, 209_898],
    ]);
  });

  /** 누가 바꿨는지 데이터베이스가 기록한다(`credit_admin_events`). */
  it("**누가 바꿨는지 함께 보낸다**", async () => {
    await 저장한다();

    expect(보낸것.every(c => c.args.p_actor === "admin-1"), "바꾼 사람을 안 보낸다").toBe(true);
  });

  it("**저장한 플랜은 켠다** — 꺼 두면 회원 관리 고르개에 안 뜬다", async () => {
    await 저장한다();

    expect(보낸것.every(c => c.args.p_active === true)).toBe(true);
  });
});

describe("말이 안 되는 값", () => {
  it.each([
    ["크레딧 0개", [{ ...PLAN_DEFAULTS[0], credits: 0 }]],
    ["소수 크레딧", [{ ...PLAN_DEFAULTS[0], credits: 1.5 }]],
    ["빈 목록", []],
    ["목록이 아님", "플랜"],
  ])("**%s 는 400 이고 데이터베이스에 안 간다**", async (_이름, plans) => {
    const response = await 저장한다(plans);

    expect(response.status).toBe(400);
    expect(보낸것, "막혔는데 데이터베이스를 건드렸다").toEqual([]);
  });
});

/**
 * **반쯤 하다 멈추면 어디까지 갔는지 말한다.**
 *
 * 셋 중 둘만 들어간 채로 「실패」만 알리면, 운영자는 지금 어떤 상태인지
 * 모른 채 다시 누른다.
 */
describe("가다 멈추면", () => {
  it("**어디까지 갔는지 말한다**", async () => {
    rpc오류 = "권한이 없습니다";
    오류낼차례 = 3; // Ultra 에서 실패

    const response = await 저장한다();
    const body = (await response.json()) as { ok: boolean; saved: string[]; message: string };

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.saved).toEqual(["Basic", "Premium"]);
    expect(body.message).toContain("Ultra");
  });

  it("**첫 줄에서 막히면 아무것도 저장 안 됐다고 말한다**", async () => {
    rpc오류 = "잠겨 있습니다";
    오류낼차례 = 1;

    const body = (await (await 저장한다()).json()) as { saved: string[]; message: string };

    expect(body.saved).toEqual([]);
    expect(body.message).toContain("저장하지 못했습니다");
  });
});

describe("지금 저장된 값 읽기", () => {
  it("**표에서 읽어 돌려준다**", async () => {
    표읽기 = { data: [{ id: "basic", name: "Basic", monthly_units: 75, price_krw: 62_033, active: true }], error: null };

    const body = (await (await GET()).json()) as { ok: boolean; plans: unknown[] };

    expect(body.ok).toBe(true);
    expect(body.plans).toHaveLength(1);
  });

  it("**못 읽으면 그렇다고 말한다** — 빈 목록으로 속이지 않는다", async () => {
    표읽기 = { data: null, error: { message: "표가 없습니다" } };

    const response = await GET();
    const body = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.message).toBe("저장된 플랜을 읽지 못했습니다.");
  });

  /** 데이터베이스 원문(표 이름 등)은 서버 기록에만 남긴다(2026-10-07). */
  it("**데이터베이스 원문을 화면에 보내지 않는다**", async () => {
    표읽기 = { data: null, error: { message: 'relation "subscription_plans" does not exist' } };

    const body = (await (await GET()).json()) as { message: string };

    expect(body.message).not.toContain("subscription_plans");
  });
});

describe("원문 가리기", () => {
  it("**저장하다 멈춘 데이터베이스 원문은 안 보이고 어디까지 갔는지는 그대로다**", async () => {
    rpc오류 = "credit_admin_required";
    오류낼차례 = 3;

    const response = await 저장한다();
    const body = (await response.json()) as { ok: boolean; saved: string[]; message: string };

    expect(response.status).toBe(500);
    expect(body.saved).toEqual(["Basic", "Premium"]);
    expect(body.message).toBe("Basic·Premium까지 저장하고 Ultra에서 멈췄습니다.");
    expect(body.message).not.toContain("credit_admin_required");
  });

  it("**첫 줄 원문도 안 보인다**", async () => {
    rpc오류 = "invalid_credit_plan";
    오류낼차례 = 1;

    const body = (await (await 저장한다()).json()) as { message: string };

    expect(body.message).toBe("저장하지 못했습니다.");
  });

  it("**검사 원문(zod) 대신 우리 문장이다** — 상태 코드는 400 그대로", async () => {
    const response = await 저장한다([{ ...PLAN_DEFAULTS[0], credits: 0 }]);
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(400);
    expect(body.message).toBe("플랜 값이 올바르지 않습니다.");
  });
});
