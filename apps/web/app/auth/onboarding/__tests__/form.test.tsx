import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ complete: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("../actions", () => ({ completeSocialOnboarding: state.complete }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace, refresh: state.refresh }) }));
import { OnboardingForm } from "../onboarding-form";
let tree: ReactTestRenderer;
beforeEach(() => { state.complete.mockReset(); state.replace.mockClear(); state.refresh.mockClear(); });
afterEach(() => { act(() => tree?.unmount()); });
describe("first social signup form", () => {
  it("keeps the submit disabled while the server is saving", async () => {
    let finish!: (value: { ok: boolean; message: string }) => void;
    state.complete.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    act(() => { tree = create(<OnboardingForm email="member@example.invalid" name="홍길동" referrer="" />); });
    act(() => { tree.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(tree.root.findAllByType("button").find(button => button.props.type === "submit")?.props.disabled).toBe(true);
    act(() => { tree.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(state.complete).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ ok: false, message: "다시 시도" }); });
    expect(tree.root.findAllByType("button").find(button => button.props.type === "submit")?.props.disabled).toBe(false);
  });
  it("asks for explicit consent without a service password and retains inputs after failure", async () => {
    state.complete.mockResolvedValue({ ok: false, message: "다시 시도해 주세요" });
    act(() => { tree = create(<OnboardingForm email="member@example.invalid" name="홍길동" referrer="" />); });
    expect(tree.root.findAllByType("input").filter(x => x.props.type === "password")).toHaveLength(0);
    expect(tree.root.findAllByType("input").filter(x => x.props.type === "checkbox").every(x => !x.props.checked)).toBe(true);
    act(() => {
      tree.root.findByProps({ id: "social-referrer" }).props.onChange({ target: { value: "friend" } });
      for (const check of tree.root.findAllByType("input").filter(x => x.props.type === "checkbox")) check.props.onChange({ target: { checked: true } });
    });
    await act(async () => { tree.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(state.complete).toHaveBeenCalledWith(expect.objectContaining({ name: "홍길동", referrer: "friend", ageConfirmed: true, termsAgreed: true }));
    expect(state.replace).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ id: "social-referrer" }).props.value).toBe("friend");
    expect(tree.root.findByProps({ role: "alert" }).children.join("")).toContain("다시 시도");
    state.complete.mockResolvedValue({ ok: true });
    await act(async () => { tree.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(state.replace).toHaveBeenCalledWith("/guide?signup=complete"); expect(state.refresh).toHaveBeenCalled();
  });
  it("offers an optional phone field and sends it with its consent", async () => {
    state.complete.mockResolvedValue({ ok: true });
    act(() => { tree = create(<OnboardingForm email="member@example.invalid" name="홍길동" referrer="" />); });
    expect(JSON.stringify(tree.toJSON())).toContain("선택");
    const phone = tree.root.findAllByType("input").find(x => x.props.id === "social-phone")!;
    expect(phone.props.required).toBeFalsy();
    act(() => { phone.props.onChange({ target: { value: "010-1234-5678" } }); });
    act(() => { for (const check of tree.root.findAllByType("input").filter(x => x.props.type === "checkbox")) check.props.onChange({ target: { checked: true } }); });
    await act(async () => { tree.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(state.complete).toHaveBeenCalledWith(expect.objectContaining({ phone: "010-1234-5678", phoneConsent: true }));
  });
});
