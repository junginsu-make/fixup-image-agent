import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **회원은 계정 화면에서 자기 전화번호(선택)를 보고 고치고 지운다**(2026-10-02 사용자 요청).
 *
 * 대상은 로그인한 본인뿐이다 — 폼에서 회원 ID 를 받지 않는다(이름·추천인과 같은 규칙).
 */
const state = vi.hoisted(() => ({ extras: vi.fn(), phone: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock("../../../lib/membership/server", () => ({ requireActiveMember: async () => ({ user: { id: "session-user" } }) }));
vi.mock("../../../lib/membership/profile-store", () => ({ updateProfileExtras: state.extras, updateProfilePhone: state.phone }));
vi.mock("../../../lib/membership/withdraw-account", () => ({ withdrawAccount: vi.fn() }));
vi.mock("../../../lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const { updateMyProfile } = await import("../actions");
const { ProfileCard } = await import("../profile-card");

beforeEach(() => {
  state.extras.mockReset().mockResolvedValue({ ok: true, message: "저장했습니다." });
  state.phone.mockReset().mockResolvedValue({ ok: true, message: "전화번호를 저장했습니다." });
});

describe("계정 화면 저장", () => {
  it("이름·추천인과 함께 본인 번호를 저장한다 — 동의 여부를 그대로 넘긴다", async () => {
    const result = await updateMyProfile({ name: "김회원", referrer: "", phone: "01012345678", phoneConsent: true, user: "someone-else" } as never);
    expect(result.ok).toBe(true);
    expect(state.phone).toHaveBeenCalledExactlyOnceWith("session-user", { phone: "01012345678", consent: true }, "member");
  });

  it("형식이 틀린 번호면 이름도 저장하지 않는다", async () => {
    const result = await updateMyProfile({ name: "김회원", referrer: "", phone: "010-12", phoneConsent: true });
    expect(result.ok).toBe(false);
    expect(state.extras).not.toHaveBeenCalled();
    expect(state.phone).not.toHaveBeenCalled();
  });

  it("번호 저장이 실패하면 이름은 저장됐다는 것과 실패 이유를 함께 알린다", async () => {
    state.phone.mockResolvedValue({ ok: false, message: "전화번호를 저장하려면 동의해 주세요." });
    const result = await updateMyProfile({ name: "김회원", referrer: "", phone: "010-1234-5678", phoneConsent: false });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("이름");
    expect(result.message).toContain("동의");
  });
});

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });

describe("계정 화면 회원 정보 카드", () => {
  it("저장된 번호를 보여 주고, 없으면 「없음」이다", () => {
    act(() => { tree = create(<ProfileCard email="a@example.invalid" name="김회원" referrer={null} phone="010-1234-5678" joinedAt="2026-10-02T00:00:00Z" />); });
    expect(JSON.stringify(tree.toJSON())).toContain("010-1234-5678");
    act(() => { tree.update(<ProfileCard email="a@example.invalid" name="김회원" referrer={null} phone={null} joinedAt="2026-10-02T00:00:00Z" />); });
    expect(JSON.stringify(tree.toJSON())).toContain("전화번호");
  });

  it("고치기에서 선택 표시가 붙은 번호 칸을 보여 준다", () => {
    act(() => { tree = create(<ProfileCard email="a@example.invalid" name="김회원" referrer={null} phone="010-1234-5678" joinedAt="2026-10-02T00:00:00Z" />); });
    const edit = tree.root.findAllByType("button").find((b) => JSON.stringify(b.props.children).includes("수정"))!;
    act(() => { edit.props.onClick(); });
    const input = tree.root.findAllByType("input").find((x) => x.props.id === "profile-phone")!;
    expect(input.props.value).toBe("010-1234-5678");
    expect(JSON.stringify(tree.toJSON())).toContain("선택");
  });
});
