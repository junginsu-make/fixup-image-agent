import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

/**
 * **「아주 지우기」 확인 문구가 실제로 지워지는 것을 다 말한다**(최종 리뷰 L3).
 *
 * 회원을 아주 지우면 그 회원의 상세페이지 작업 원본과, 관리자가 그 회원 작업으로 만든 사본도
 * 함께 지워진다(3차 리뷰 W7·W8). 확인 창과 경고 글이 그 말을 하지 않으면 관리자는 자기 사본이
 * 남는 줄 알고 누른다 — 되돌릴 수 없다.
 */
vi.mock("../actions", () => ({ approveMember: vi.fn(), deleteMember: vi.fn(), resendApproval: vi.fn(), resendConfirmation: vi.fn(), setMemberStatus: vi.fn() }));
vi.mock("../confirm-submit-button", () => ({
  ConfirmSubmitButton: ({ children, confirmMessage }: { children: React.ReactNode; confirmMessage: string }) => (
    <button type="submit" data-confirm={confirmMessage}>{children}</button>
  ),
}));
vi.mock("../member-actions", () => ({ MoreActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { MemberActions } from "../member-list/row-actions";

const profile = { id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", role: "member", status: "active",
  email_confirmed_at: "2026-10-01T00:00:00Z" } as unknown as Parameters<typeof MemberActions>[0]["profile"];

describe("L3: 회원 아주 지우기 확인 문구", () => {
  it("확인 창과 경고 글 모두 상세페이지 작업 원본과 이 회원 작업으로 만든 관리자 사본이 함께 지워진다고 말한다", () => {
    const tree = create(<MemberActions profile={profile} />);
    const button = tree.root.findAll((node) => node.type === "button" && node.props.children === "아주 지우기")[0]!;
    const confirm = String(button.props["data-confirm"]);
    const warning = tree.root.findAll((node) => node.type === "p").map((node) => node.children.join("")).join(" ");
    for (const text of [confirm, warning]) {
      expect(text).toContain("상세페이지 작업 원본");
      expect(text).toContain("관리자 사본");
      expect(text).toContain("되돌릴 수 없습니다");
    }
    expect(confirm).toContain("member@example.com");
  });
});
