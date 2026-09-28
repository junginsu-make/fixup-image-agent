import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **상태를 바꾸는 문**(설계 §10.1).
 *
 * ── 왜 이 시험이 있나 ──────────────────────────────────────
 *
 * 서버 액션은 **주소만 알면 직접 부를 수 있다.** 화면에서 단추를 감추는 것은
 * 방어가 아니다 — 관리자인지 여기서 다시 본다.
 *
 * 그리고 **모르는 값을 표에 넣지 않는다.** `status` 는 SQL 의 check 제약과
 * 짝이라(202609280002) 엉뚱한 값을 보내면 표가 거절하고, 그 오류는 관리자
 * 화면이 통째로 500 이 되는 모양으로 나온다.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let 관리자다 = true;

vi.mock("../../../lib/membership/server", () => ({
  requireAdmin: async () => {
    if (!관리자다) throw new Error("관리자 권한이 필요합니다.");
    return { user: { id: "admin-1" }, profile: { email: "admin@example.com" } };
  },
}));

const 바꾼것: Array<{ patch: Record<string, unknown>; id: string }> = [];
let 표가된다 = true;
/** 바뀐 줄 수. **0 이면 없는 문의다** — 그때도 `error` 는 `null` 이다. */
let 바뀐줄 = 1;

vi.mock("../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_column: string, id: string) => ({
          select: async () => {
            바꾼것.push({ patch, id });
            return 표가된다
              ? { data: Array.from({ length: 바뀐줄 }, () => ({ id })), error: null }
              : { data: null, error: { message: "표가 죽었다" } };
          },
        }),
      }),
    }),
  }),
}));

const { setInquiryStatus } = await import("../system/inquiry-actions");

const 좋은번호 = "11111111-1111-4111-8111-111111111111";

const 부른다 = (id: string, status: string) => {
  const form = new FormData();
  form.set("id", id);
  form.set("status", status);
  return setInquiryStatus(form);
};

beforeEach(() => {
  바꾼것.length = 0;
  관리자다 = true;
  표가된다 = true;
  바뀐줄 = 1;
});

describe("상태 바꾸기", () => {
  it("**관리자는 바꿀 수 있다**", async () => {
    await 부른다(좋은번호, "reading");

    expect(바꾼것).toEqual([{ patch: { status: "reading" }, id: 좋은번호 }]);
  });

  it("**관리자가 아니면 막힌다**", async () => {
    관리자다 = false;

    await expect(부른다(좋은번호, "done")).rejects.toThrow("관리자");
    expect(바꾼것, "막혔는데 표를 바꿨다").toEqual([]);
  });

  it("**모르는 상태는 넣지 않는다**", async () => {
    await expect(부른다(좋은번호, "삭제됨")).rejects.toThrow("상태");
    expect(바꾼것, "표의 check 제약에 걸릴 값을 보냈다").toEqual([]);
  });

  it("**번호가 아니면 막는다**", async () => {
    await expect(부른다("1 or 1=1", "done")).rejects.toThrow("문의");
    expect(바꾼것).toEqual([]);
  });

  it("**세 상태는 모두 된다**", async () => {
    for (const status of ["new", "reading", "done"]) await 부른다(좋은번호, status);

    expect(바꾼것.map((it) => it.patch.status)).toEqual(["new", "reading", "done"]);
  });

  /** 못 바꿨으면 조용히 넘기지 않는다. 안 바뀐 채로 바뀐 줄 알면 안 된다. */
  it("**표가 거절하면 알린다**", async () => {
    표가된다 = false;

    await expect(부른다(좋은번호, "done")).rejects.toThrow("바꾸지 못했습니다");
  });

  /**
   * **0줄이 맞아도 `error` 는 `null` 이다**(2026-09-28 독립 검토). 지워진
   * 문의에 대고 눌러도 아무 말 없이 화면만 다시 그려지면 관리자는 바뀐 줄
   * 안다.
   */
  it("**없는 문의면 알린다**", async () => {
    바뀐줄 = 0;

    await expect(부른다(좋은번호, "done")).rejects.toThrow("없는 문의");
  });
});
