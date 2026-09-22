import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **누른 자리에서 열린다**(2026-09-22 사용자 신고).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * 회원 관리 표에서 「플랜·크레딧·정보」를 누르면 상세가 **표 위쪽**에 그려지고,
 * 화면이 그리로 끌려 올라갔다.
 *
 * ```
 * useEffect(() => { if (focusId) panel.current?.scrollIntoView(…); }, [focusId]);
 * ```
 *
 * 스무 번째 회원을 누르면 맨 위로 튀고, 닫으면 다시 찾아 내려와야 했다.
 * 사용자 말로 「자꾸 포인트가 바뀌니까 헷갈립니다」.
 *
 * ── 왜 가운데 창이 아닌가 ──────────────────────────────────
 *
 * 사용자가 「그 자리에서 열리게」를 먼저 말했고, 그 편이 **누른 줄이 계속
 * 보인다** — 어느 회원 것을 보고 있는지 헷갈릴 일이 없다.
 *
 * ── 무엇을 재는가 ──────────────────────────────────────────
 *
 * 세 가지다 — **열리는가**, **누른 줄 바로 뒤에 열리는가**, 그리고 **화면을
 * 끌어올리지 않는가.**
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin",
}));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useFormStatus: () => ({ pending: false }),
}));
vi.mock("../actions", () => ({
  approveMember: vi.fn(), setMemberStatus: vi.fn(), updateQuota: vi.fn(), resendApproval: vi.fn(),
  updateModelPrice: vi.fn(), updateAiBadge: vi.fn(), updateUsdKrw: vi.fn(), deleteMember: vi.fn(),
  resendConfirmation: vi.fn(), assignTeamFromAdmin: vi.fn(), setTeamRoleFromAdmin: vi.fn(),
  adminUpdateMemberProfile: vi.fn(), adminSendPasswordReset: vi.fn(), adminSetMemberPassword: vi.fn(),
}));
vi.mock("../members/actions", () => ({
  creditMemberHistory: vi.fn(async () => ({ grants: [], pending: [], audit: [] })),
  changeCredits: vi.fn(),
}));

const { MemberTable } = await import("../member-list/member-table");

const 회원 = (id: string, email: string) => ({
  profile: {
    id, email,
    email_confirmed_at: "2026-09-01T00:00:00Z",
    role: "member", status: "active",
    created_at: "2026-09-01T00:00:00Z", approved_at: "2026-09-02T00:00:00Z",
    monthly_quota: 0, approval_notified_at: null,
  },
  team: undefined, name: null, referrer: null,
  monthImages: 0, monthCost: "0원", totalCost: "0원", totalImages: 0,
  // 크레딧이 없으면 플랜·크레딧 칸이 통째로 안 그려진다. 재려는 것이 그 칸이다.
  credit: {
    available: 10, reserved: 0, used: 0, unlimited: false,
    planId: null, planStatus: null, nextExpires: null, reviewUnits: 0,
  },
});

/** 스크롤을 불렀는지 본다. `ref` 가 붙는 host 노드를 흉내 낸다. */
const 끌어올림 = vi.fn();

let renderer: ReactTestRenderer;

const 글자 = (node: { children: unknown[] }) =>
  node.children.filter((child): child is string => typeof child === "string").join("");

const 단추 = (말: string) =>
  renderer.root.findAll((node) => node.type === "button" && 글자(node as never).includes(말));

const 그려진글 = () => JSON.stringify(renderer.toJSON());

type 그린것 = { type?: string; children?: unknown[] } | string | null;

/** 그려진 나무에서 글자만 긁는다. 시험 인스턴스는 순환 참조라 JSON 으로 못 만든다. */
const 글자모으기 = (node: 그린것): string => {
  if (node === null) return "";
  if (typeof node === "string") return node;
  return (node.children ?? []).map((child) => 글자모으기(child as 그린것)).join(" ");
};

/** 표 몸통의 줄들을 **그려진 순서대로** 글자로 바꾼다. */
const 표의줄들 = (): string[] => {
  const 찾기 = (node: 그린것): 그린것 => {
    if (node === null || typeof node === "string") return null;
    if (node.type === "tbody") return node;
    for (const child of node.children ?? []) {
      const found = 찾기(child as 그린것);
      if (found) return found;
    }
    return null;
  };

  const 몸통 = 찾기(renderer.toJSON() as 그린것);
  if (!몸통 || typeof 몸통 === "string") return [];
  return (몸통.children ?? []).map((child) => 글자모으기(child as 그린것));
};

const 띄운다 = async (rows: unknown[]) => {
  await act(async () => {
    renderer = create(
      <MemberTable rows={rows as never} plans={[]} teams={[]} ledger teamsEnabled={false} />,
      { createNodeMock: () => ({ scrollIntoView: 끌어올림 }) },
    );
  });
};

const 세사람 = () => [회원("u1", "one@example.com"), 회원("u2", "two@example.com"), 회원("u3", "three@example.com")];

beforeEach(() => {
  끌어올림.mockClear();
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

describe("열기 전", () => {
  it("**상세가 안 열려 있다**", async () => {
    await 띄운다(세사람());

    expect(그려진글(), "누르기도 전에 상세가 열려 있다").not.toContain("크레딧 지급");
  });
});

describe("누르면", () => {
  it("**상세가 열린다**", async () => {
    await 띄운다(세사람());

    await act(async () => {
      단추("플랜·크레딧·정보")[1]!.props.onClick();
    });

    expect(그려진글(), "상세가 안 열렸다").toContain("크레딧 지급");
  });

  /**
   * **화면을 끌어올리지 않는다.** 이것이 신고의 핵심이다. 스무 번째 회원을
   * 눌렀는데 맨 위로 튀면, 닫은 뒤 다시 찾아 내려와야 한다.
   */
  it("**화면을 끌어올리지 않는다**", async () => {
    await 띄운다(세사람());

    await act(async () => {
      단추("플랜·크레딧·정보")[2]!.props.onClick();
    });

    expect(끌어올림, "화면을 다른 곳으로 끌어올린다").not.toHaveBeenCalled();
  });

  /**
   * **누른 줄 바로 뒤에 연다.** 표 맨 위에 열면 어느 회원 것인지 다시
   * 확인해야 한다. 붙어서 열려야 눈이 안 움직인다.
   */
  it("**누른 줄 바로 뒤에 연다**", async () => {
    await 띄운다(세사람());

    await act(async () => {
      단추("플랜·크레딧·정보")[1]!.props.onClick();
    });

    const 줄들 = 표의줄들();
    const 연자리 = 줄들.findIndex((줄) => 줄.includes("크레딧 지급"));
    const 누른자리 = 줄들.findIndex((줄) => 줄.includes("two@example.com"));

    expect(누른자리, "누른 줄을 못 찾았다").toBeGreaterThanOrEqual(0);
    expect(연자리, `상세가 누른 줄(${누른자리}) 바로 뒤가 아니다`).toBe(누른자리 + 1);
  });

  it("**다른 회원을 누르면 그쪽으로 옮겨 간다**", async () => {
    await 띄운다(세사람());

    await act(async () => {
      단추("플랜·크레딧·정보")[0]!.props.onClick();
    });
    await act(async () => {
      단추("플랜·크레딧·정보")[2]!.props.onClick();
    });

    const 줄들 = 표의줄들();
    const 연것 = 줄들.filter((줄) => 줄.includes("크레딧 지급"));

    expect(연것.length, "상세가 두 군데 열려 있다").toBe(1);

    const 연자리 = 줄들.findIndex((줄) => 줄.includes("크레딧 지급"));
    const 누른자리 = 줄들.findIndex((줄) => 줄.includes("three@example.com"));
    expect(연자리).toBe(누른자리 + 1);
  });

  /**
   * **표가 안 깨져야 한다.** 상세를 담는 칸이 열 수보다 좁으면 그 줄만 밀려
   * 표가 어긋난다.
   */
  it("**상세 칸이 표 전체 너비를 덮는다**", async () => {
    await 띄운다(세사람());

    await act(async () => {
      단추("플랜·크레딧·정보")[0]!.props.onClick();
    });

    // 여러 열을 덮는 칸은 상세 칸 하나뿐이다.
    const 칸 = renderer.root.findAllByType("td").filter((node) => typeof node.props.colSpan === "number");
    const 열수 = renderer.root.findAllByType("th").length;

    expect(칸.length, "여러 열을 덮는 칸이 하나가 아니다").toBe(1);
    expect(칸[0]!.props.colSpan, `열이 ${열수}개인데 덮는 폭이 다르다`).toBe(열수);
  });
});
