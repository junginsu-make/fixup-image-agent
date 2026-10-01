import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

/**
 * **관리자 화면 「fal 계정」**(보충 2026-10-01). 화면이 무엇을 말하는지 본다 — 끝 4자리만, 상태 이름, 진행 중 수,
 * 서버 열쇠가 없을 때의 경고, 진행 중이면 키 바꾸기·지우기 단추가 잠김, 못 읽었을 때.
 */
vi.mock("server-only", () => ({}));
vi.mock("../system/fal-account-actions", () => ({
  addFalAccountAction: vi.fn(), updateFalAccountAction: vi.fn(), replaceFalKeyAction: vi.fn(),
  recheckFalAccountAction: vi.fn(), deleteFalAccountAction: vi.fn(),
}));
vi.mock("../confirm-submit-button", () => ({
  ConfirmSubmitButton: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) =>
    React.createElement("button", { type: "submit", disabled }, children),
}));

const { FalAccountsPanel } = await import("../system/fal-accounts-panel");
type View = NonNullable<Parameters<typeof FalAccountsPanel>[0]["view"]>;

const 계정 = (extra: Partial<View["accounts"][number]> = {}): View["accounts"][number] => ({
  id: "a1000000-0000-4000-8000-000000000001", name: "fal-1 (ai.dev 계정)", keyLast4: "WXYZ", enabled: true, limit: 20,
  state: "ok", cooldownUntil: null, lastErrorKind: null, lastErrorAt: null, lastErrorDetail: null, inFlight: 0, ...extra,
});

const 글 = (view: View | null) => JSON.stringify(create(<FalAccountsPanel view={view} />).toJSON());
const 단추 = (view: View, label: string) =>
  create(<FalAccountsPanel view={view} />).root.findAll((node) => node.type === "button" && JSON.stringify(node.props.children).includes(label));

describe("fal 계정 패널", () => {
  it("끝 4자리·사용·진행 중/한도·상태를 보인다", () => {
    const text = 글({ masterKey: "ok", accounts: [계정({ inFlight: 3 })], events: [] });
    expect(text).toContain("····");
    expect(text).toContain("WXYZ");
    expect(text).toContain("진행 중 ");
    expect(text).toContain("정상");
  });

  it("마지막 오류의 종류와 시각(한국 시각)을 보인다", () => {
    const text = 글({ masterKey: "ok", events: [], accounts: [계정({ state: "locked", lastErrorKind: "locked", lastErrorAt: "2026-10-01T00:30:00Z", lastErrorDetail: "User is locked" })] });
    expect(text).toContain("잔액 소진");
    // 24시간 표기 — 「오전/AM」은 실행 환경의 ICU 에 따라 달라 CI 에서 「AM」으로 나왔다
    expect(text).toContain("09:30");
    expect(text).not.toMatch(/AM|PM|오전|오후/);
  });

  it("계정이 없으면 서버 FAL_KEY 로 만든다고 말한다", () => {
    expect(글({ masterKey: "ok", accounts: [], events: [] })).toContain("등록된 계정이 없습니다. 지금은 서버 FAL_KEY 하나로 만듭니다.");
  });

  it("서버 열쇠가 없으면 경고하고 등록 단추를 잠근다", () => {
    const view: View = { masterKey: "missing", accounts: [], events: [] };
    expect(글(view)).toContain("FAL_KEY_ENCRYPTION_SECRET");
    expect(단추(view, "확인하고 등록")[0]!.props.disabled).toBe(true);
  });

  it("진행 중이 있으면 키 바꾸기·지우기 단추가 잠긴다", () => {
    const view: View = { masterKey: "ok", accounts: [계정({ inFlight: 1 })], events: [] };
    expect(단추(view, "키 바꾸기")[0]!.props.disabled).toBe(true);
    expect(단추(view, "지우기")[0]!.props.disabled).toBe(true);
  });

  it("키 입력칸은 가려진 칸이고 자동 완성을 끈다", () => {
    const inputs = create(<FalAccountsPanel view={{ masterKey: "ok", accounts: [계정()], events: [] }} />).root
      .findAll((node) => node.props.name === "key" && typeof node.type !== "string");
    expect(inputs.length).toBe(2);
    for (const input of inputs) expect(input.props).toMatchObject({ type: "password", autoComplete: "off" });
  });

  it("못 읽었으면 단추 없이 모른다고 말한다", () => {
    const text = 글(null);
    expect(text).toContain("fal 계정 목록을 읽지 못했습니다");
    expect(text).not.toContain("확인하고 등록");
  });

  it("변경 기록에 누가 무엇을 했는지", () => {
    const text = 글({ masterKey: "ok", accounts: [], events: [{ at: "2026-10-01T01:00:00Z", action: "fal_account_disable", actorEmail: "ai.dev@example.invalid", name: "fal-1" }] });
    expect(text).toContain("사용 끔");
    expect(text).toContain("ai.dev@example.invalid");
  });
});
