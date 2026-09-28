import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **문의 목록을 읽는다**(설계 §10.3).
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * 둘이다.
 *   ① **못 읽어도 화면이 죽지 않는다** — 이 표는 나중에 붙었다
 *   ② 표에서 온 값을 **믿지 않는다** — `jsonb` 는 무엇이든 담는다
 */

vi.mock("server-only", () => ({}));

let 목록답: { data: unknown; error: unknown } = { data: [], error: null };
let 셈답: { count: unknown; error: unknown } = { count: 0, error: null };
const 부른것: Array<Record<string, unknown>> = [];

vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      부른것.push({ table });
      const 사슬 = {
        select: (columns: string, options?: unknown) => {
          부른것.push({ columns, options });
          // `head: true` 는 셈이다. 목록과 길이 다르다.
          if (options) return {
            eq: async (column: string, value: string) => {
              부른것.push({ eq: [column, value] });
              return 셈답;
            },
          };
          return {
            order: () => ({ limit: async () => 목록답 }),
          };
        },
      };
      return 사슬;
    },
  }),
}));

const { listInquiries, countNewInquiries, inquiryFrom, isInquiryStatus, safeGuideHref } =
  await import("../inquiry-store");

const 한줄 = {
  id: "inq-1",
  user_id: "me-1",
  created_at: "2026-09-28T01:00:00Z",
  question: "결제가 안 돼요",
  transcript: [{ role: "user", text: "결제가 안 됩니다" }],
  evidence: [{ name: "이용 안내 · 크레딧", href: "/guide/credits" }],
  page: "/settings",
  status: "new",
  mailed_at: null,
  profiles: { email: "me@example.com" },
};

beforeEach(() => {
  부른것.length = 0;
  목록답 = { data: [한줄], error: null };
  셈답 = { count: 3, error: null };
});

describe("목록", () => {
  it("**읽은 것을 화면 모양으로 준다**", async () => {
    const rows = await listInquiries();

    expect(rows.length).toBe(1);
    expect(rows[0]?.email).toBe("me@example.com");
    expect(rows[0]?.turns).toEqual([{ role: "user", text: "결제가 안 됩니다" }]);
    expect(rows[0]?.sources).toEqual([{ name: "이용 안내 · 크레딧", href: "/guide/credits" }]);
  });

  /**
   * **표가 없어도 관리자 화면은 열린다.** 마이그레이션 전 서버에는 이 표가
   * 없다. 던지면 관리자 화면 전체가 500 이 된다.
   */
  it("**못 읽으면 빈 목록이다**", async () => {
    목록답 = { data: null, error: { message: "relation cs_inquiries does not exist" } };

    await expect(listInquiries()).resolves.toEqual([]);
  });

  it("**회원 이메일을 함께 읽는다** — 누가 물었는지 없으면 쓸 수 없다", async () => {
    await listInquiries();

    expect(String(부른것.find((c) => c.columns)?.columns)).toContain("profiles(email)");
  });
});

describe("안 본 것의 수", () => {
  it("**안 본 것만 센다**", async () => {
    expect(await countNewInquiries()).toBe(3);
    // 무엇으로 걸렀는지까지 본다. 다 세면 탭의 수가 줄지 않는다.
    expect(부른것).toContainEqual({ eq: ["status", "new"] });
  });

  it("**못 세면 0 이다** — 없는 수를 지어내지 않는다", async () => {
    셈답 = { count: null, error: { message: "없는 표" } };

    expect(await countNewInquiries()).toBe(0);
  });
});

/**
 * **`jsonb` 는 무엇이든 담는다.** 앱이 넣은 모양이라고 믿으면, 손으로 한 줄
 * 고친 날 화면이 죽는다.
 */
describe("표에서 온 값", () => {
  it("**대화가 배열이 아니면 빈 것으로 본다**", () => {
    expect(inquiryFrom({ ...한줄, transcript: "결제가 안 돼요" } as never).turns).toEqual([]);
  });

  it("**모르는 말은 버린다**", () => {
    const row = inquiryFrom({
      ...한줄,
      transcript: [{ role: "admin", text: "몰래 넣은 말" }, { role: "user", text: "진짜 말" }],
    } as never);

    expect(row.turns).toEqual([{ role: "user", text: "진짜 말" }]);
  });

  it("**글이 아닌 말은 버린다**", () => {
    expect(inquiryFrom({ ...한줄, transcript: [{ role: "user", text: 12 }] } as never).turns).toEqual([]);
  });

  /** 이름이 없으면 화면에 빈 알약이 그려진다. 누를 수는 있는데 아무 글이 없다. */
  it("**이름 없는 근거는 버린다**", () => {
    expect(inquiryFrom({ ...한줄, evidence: [{ href: "/guide/credits" }] } as never).sources).toEqual([]);
  });

  it("**근거에 주소가 없어도 이름은 살린다**", () => {
    expect(inquiryFrom({ ...한줄, evidence: [{ name: "어떤 문서" }] } as never).sources)
      .toEqual([{ name: "어떤 문서", href: "" }]);
  });

  /**
   * **모르는 상태를 「안 봄」으로 둔다.** 조용히 안 보이게 하면 답을 기다리는
   * 사람이 잊힌다.
   */
  it("**모르는 상태는 안 봄으로 본다**", () => {
    expect(inquiryFrom({ ...한줄, status: "삭제됨" } as never).status).toBe("new");
  });

  it("**회원을 못 찾아도 줄은 남는다**", () => {
    expect(inquiryFrom({ ...한줄, profiles: null } as never).email).toBe("(알 수 없음)");
  });

  /**
   * **관리자가 누르는 링크다.** 옛 줄은 화면이 보낸 근거를 그대로 실었으므로
   * (2026-09-28 에 서버 것으로 바꿨다) 표에 든 주소를 믿지 않는다.
   */
  it("**이 사이트의 길만 링크가 된다**", () => {
    expect(safeGuideHref("/guide/credits")).toBe("/guide/credits");
    expect(safeGuideHref("javascript:alert(document.cookie)"), "스크립트 주소가 통과했다").toBe("");
    expect(safeGuideHref("https://evil.example.com"), "남의 사이트가 통과했다").toBe("");
    expect(safeGuideHref("//evil.example.com"), "남의 사이트가 통과했다").toBe("");
    expect(safeGuideHref("data:text/html,<script>1</script>")).toBe("");
    expect(safeGuideHref(12)).toBe("");
    expect(safeGuideHref(undefined)).toBe("");
  });

  /** 앞뒤 빈칸으로 검사를 비켜 가지 못하게 한다. */
  it("**빈칸을 앞에 붙여도 안 통한다**", () => {
    expect(safeGuideHref("  javascript:alert(1)")).toBe("");
    expect(safeGuideHref("  /guide/credits")).toBe("/guide/credits");
  });

  it("**표에서 온 근거의 주소도 거른다**", () => {
    const row = inquiryFrom({
      ...한줄,
      evidence: [{ name: "눌러 보세요", href: "javascript:alert(1)" }],
    } as never);

    expect(row.sources, "스크립트 주소가 화면까지 갔다").toEqual([{ name: "눌러 보세요", href: "" }]);
  });

  it("**상태 이름은 셋뿐이다**", () => {
    expect(isInquiryStatus("reading")).toBe(true);
    expect(isInquiryStatus("closed")).toBe(false);
    expect(isInquiryStatus(undefined)).toBe(false);
  });
});
