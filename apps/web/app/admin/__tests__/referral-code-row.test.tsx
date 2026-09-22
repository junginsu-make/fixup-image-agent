import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * **회원이 적은 추천코드를 관리자가 회원마다 본다**(2026-09-22 사용자 요청).
 *
 * 「여기에 작성된게 관리자페이지 각 회원들도 다 보여야 합니다」.
 *
 * ── 왜 띄워서 재는가 ───────────────────────────────────────
 *
 * 소스에 `row.referrer` 가 있는지만 보면 **내려받는 표에만 있어도 통과한다** —
 * 실제로 화면 줄에서 지워 봐도 안 잡혔다. 그려진 글자를 본다.
 */

vi.mock("server-only", () => ({}));
/*
  `react-dom` 18 에는 `useFormStatus` 가 없다(서버 액션 폼과 함께 온 것이다).
  시험 환경에서 그대로 부르면 마운트가 터진다.
*/
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useFormStatus: () => ({ pending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin",
}));
/*
  서버 전용 곁가지를 끊는다. 회원 줄이 크레딧 패널을 거쳐 서버 액션을
  들여오고, 그 끝에 `React.cache` 가 있어 시험 환경에서는 모듈이 아예 안 뜬다.
  재는 것은 **그려진 회원 줄**이다.
*/
vi.mock("../../../lib/membership/server", () => ({
  getMembership: async () => null,
  requireMembership: async () => null,
}));
// 서버 액션은 부르지 않는다. 재는 것은 **그려진 회원 줄**이다.
vi.mock("../actions", () => ({
  approveMember: vi.fn(),
  setMemberStatus: vi.fn(),
  updateQuota: vi.fn(),
  resendApproval: vi.fn(),
  updateModelPrice: vi.fn(),
  updateAiBadge: vi.fn(),
  updateUsdKrw: vi.fn(),
  deleteMember: vi.fn(),
  resendConfirmation: vi.fn(),
  assignTeamFromAdmin: vi.fn(),
  setTeamRoleFromAdmin: vi.fn(),
  adminUpdateMemberProfile: vi.fn(),
  adminSendPasswordReset: vi.fn(),
  adminSetMemberPassword: vi.fn(),
}));
vi.mock("../members/actions", () => ({ creditMemberHistory: vi.fn(), changeCredits: vi.fn() }));

const { MemberTable } = await import("../member-list/member-table");

const 회원 = (over: Record<string, unknown> = {}) => ({
  profile: {
    id: "u1",
    email: "member@example.com",
    email_confirmed_at: "2026-09-01T00:00:00Z",
    role: "member",
    status: "active",
    created_at: "2026-09-01T00:00:00Z",
    approved_at: "2026-09-02T00:00:00Z",
    monthly_quota: 0,
    approval_notified_at: null,
  },
  team: undefined,
  name: "김회원",
  referrer: "FRIEND-2026",
  monthImages: 0,
  monthCost: "0원",
  totalCost: "0원",
  totalImages: 0,
  credit: null,
  ...over,
});

let renderer: ReactTestRenderer;

const 그려진글 = () => JSON.stringify(renderer.toJSON());

const 띄운다 = async (rows: unknown[]) => {
  await act(async () => {
    renderer = create(
      <MemberTable rows={rows as never} plans={[]} teams={[]} ledger teamsEnabled={false} />,
    );
  });
};

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

describe("회원 줄", () => {
  it("**회원이 적은 추천코드를 그린다**", async () => {
    await 띄운다([회원()]);

    expect(그려진글(), "추천코드 값이 화면에 없다").toContain("FRIEND-2026");
  });

  it("**「추천코드」라고 부른다** — 「추천인」이 아니다", async () => {
    await 띄운다([회원()]);

    const 글 = 그려진글();
    expect(글).toContain("추천코드");
    expect(글, "옛 이름이 남았다").not.toContain("추천인");
  });

  /**
   * **회원마다 그린다.** 첫 줄만 그리면 목록에서는 한 사람 것만 보인다.
   */
  it("**여러 회원이면 각각 그린다**", async () => {
    await 띄운다([
      회원(),
      회원({
        profile: { ...회원().profile, id: "u2", email: "second@example.com" },
        name: "이회원",
        referrer: "PARTNER-77",
      }),
    ]);

    const 글 = 그려진글();
    expect(글).toContain("FRIEND-2026");
    expect(글, "둘째 회원 것이 없다").toContain("PARTNER-77");
  });

  /**
   * **안 적은 사람에게는 빈 줄을 안 만든다.** 선택 칸이라 대부분 비어 있다.
   */
  it("**안 적었으면 그 줄을 안 만든다**", async () => {
    await 띄운다([회원({ referrer: null })]);

    expect(그려진글()).not.toContain("추천코드(적은 값)");
  });
});
