import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자가 회원마다 가입 방식을 본다**(2026-10-02 사용자 요청).
 *
 * 「가입 방식도 보이게 해주세요」. Google 가입을 열면서 이메일 회원과 구분이
 * 필요해졌다. 화면 줄과 내려받는 표 양쪽에 같은 이름으로 나온다.
 * 소셜 도입 전 회원은 `signup_provider` 가 비어 있다 — 그때는 이메일 가입뿐이었다.
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

const { MemberTable, memberCsv, signupMethodLabel } = await import("../member-list/member-table");

const 회원 = (provider: string | null) => ({
  profile: {
    id: `u-${provider}`,
    email: `${provider}@example.com`,
    email_confirmed_at: "2026-09-01T00:00:00Z",
    role: "member",
    status: "active",
    created_at: "2026-09-01T00:00:00Z",
    approved_at: "2026-09-02T00:00:00Z",
    monthly_quota: 0,
    signup_provider: provider,
    onboarding_required: provider === "google",
    onboarding_completed_at: provider === "google" ? "2026-10-02T00:00:00Z" : null,
  },
  team: undefined,
  name: "김회원",
  referrer: null,
  monthImages: 0,
  monthCost: "0원",
  totalCost: "0원",
  totalImages: 0,
  credit: null,
});

let renderer: ReactTestRenderer;
const 그려진글 = () => JSON.stringify(renderer.toJSON());
const 띄운다 = async (rows: unknown[]) => {
  await act(async () => {
    renderer = create(<MemberTable rows={rows as never} plans={[]} teams={[]} ledger teamsEnabled={false} />);
  });
};
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

describe("가입 방식", () => {
  it("**공급자마다 알아볼 이름을 붙인다** — 비어 있으면 소셜 도입 전 이메일 가입이다", () => {
    expect(signupMethodLabel("google")).toBe("Google 가입");
    expect(signupMethodLabel("kakao")).toBe("카카오 가입");
    expect(signupMethodLabel("email")).toBe("이메일 가입");
    expect(signupMethodLabel(null)).toBe("이메일 가입");
    expect(signupMethodLabel(undefined)).toBe("이메일 가입");
  });

  /**
   * **내려받는 표도 화면과 같은 상태를 쓴다**(2026-10-02). 전에는 `status` 를
   * 그대로 적어 가입 확인을 안 마친 소셜 회원이 `active` 로 나갔다.
   */
  it("**내려받는 표에 가입 방식과 화면과 같은 상태를 적는다**", () => {
    const 미완료 = 회원("google");
    const csv = memberCsv([
      { ...미완료, profile: { ...미완료.profile, onboarding_completed_at: null } },
      회원(null),
    ] as never, (id) => id);
    const [머리, 소셜, 이메일] = csv.replace("﻿", "").split("\r\n");
    expect(머리).toContain('"가입 방식"');
    expect(소셜).toContain('"Google 가입"');
    expect(소셜).toContain('"가입 정보 확인 전"');
    expect(소셜, "상태 영어 값이 그대로 나갔다").not.toContain('"active"');
    expect(이메일).toContain('"이메일 가입"');
    expect(이메일).toContain('"활성"');
  });

  it("**회원 줄마다 가입 방식을 그린다**", async () => {
    await 띄운다([회원("google"), 회원(null)]);
    const 글 = 그려진글();
    expect(글, "Google 회원 표시가 없다").toContain("Google 가입");
    expect(글, "이메일 회원 표시가 없다").toContain("이메일 가입");
  });
});
