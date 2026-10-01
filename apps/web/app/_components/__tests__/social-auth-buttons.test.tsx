import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ getUser: vi.fn(), oauth: vi.fn() }));
vi.mock("../../../lib/supabase/browser", () => ({ createSupabaseBrowserClient: () => ({ auth: { getUser: state.getUser, signInWithOAuth: state.oauth } }) }));
import { SocialAuthButtons } from "../social-auth-buttons";
let tree: ReactTestRenderer;
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://studio.example.com"); vi.stubEnv("NEXT_PUBLIC_AUTH_GOOGLE_ENABLED", "1"); vi.stubEnv("NEXT_PUBLIC_AUTH_KAKAO_ENABLED", "1");
  state.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
  state.oauth.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllEnvs(); });
describe("social buttons", () => {
  it("is hidden by default", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_GOOGLE_ENABLED", "0"); vi.stubEnv("NEXT_PUBLIC_AUTH_KAKAO_ENABLED", "0");
    act(() => { tree = create(<SocialAuthButtons />); }); expect(tree.toJSON()).toBeNull();
  });
  it("starts OAuth without submitting an email form, and guards a double click", async () => {
    act(() => { tree = create(<SocialAuthButtons next="/library" />); });
    const button = tree.root.findAllByType("button")[0]; expect(button.props.type).toBe("button");
    await act(async () => { await Promise.all([button.props.onClick(), button.props.onClick()]); });
    expect(state.oauth).toHaveBeenCalledTimes(1); expect(state.oauth.mock.calls[0][0]).toMatchObject({ provider: "google", options: { queryParams: { prompt: "select_account" } } });
    expect(tree.root.findAllByType("button").every(b => b.props.disabled)).toBe(true);
  });
  it("requires logout before switching an existing session and allows retry after errors", async () => {
    state.getUser.mockResolvedValue({ data: { user: { id: "existing" } }, error: null });
    act(() => { tree = create(<SocialAuthButtons />); });
    await act(async () => { await tree.root.findAllByType("button")[1].props.onClick(); });
    expect(state.oauth).not.toHaveBeenCalled(); expect(tree.root.findByProps({ role: "alert" }).children.join("")).toContain("로그아웃");
    expect(tree.root.findAllByType("button").every(b => !b.props.disabled)).toBe(true);
  });
});
