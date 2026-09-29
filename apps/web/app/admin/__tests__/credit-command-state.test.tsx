import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ change: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: f.refresh }) }));
vi.mock("../members/actions", () => ({ changeCredits: f.change }));
import { useCreditCommand } from "../member-list/use-credit-command";

const draft = { kind: "grant" as const, users: ["10000000-0000-4000-8000-000000000002"], grantKind: "purchase" as const, units: 100, amount: 0, expires: null, reason: "관리자 지급" };
let state: ReturnType<typeof useCreditCommand>;
let view: ReactTestRenderer;
function Probe() { state = useCreditCommand(); return null; }

beforeEach(() => {
  f.change.mockReset(); f.refresh.mockReset();
  vi.stubGlobal("crypto", { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
  act(() => { view = create(<Probe />); });
});
afterEach(() => { act(() => view.unmount()); vi.unstubAllGlobals(); });

describe("admin credit requests", () => {
  it("prepares a grant on HTTP without randomUUID, before making a server request", () => {
    act(() => state.submit(draft));
    expect(state.review).toMatchObject(draft);
    expect((state.review as { action: string }).action).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(f.change).not.toHaveBeenCalled();
  });

  it("keeps pending true until acknowledgement and prevents double submission", async () => {
    let resolve!: (value: { ok: boolean; message: string }) => void;
    f.change.mockImplementation(() => new Promise(r => { resolve = r; }));
    act(() => state.submit(draft));
    const command = state.review!;
    act(() => { void state.execute(command); void state.execute(command); });
    expect(state.pending).toBe(true);
    expect(f.change).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ ok: true, message: "100크레딧 지급 완료" }); });
    expect(state.pending).toBe(false);
    expect(state.notice).toEqual({ ok: true, text: "100크레딧 지급 완료" });
    expect(f.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a network failure and reuses the original request on retry", async () => {
    f.change.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce({ ok: true, message: "완료" });
    act(() => state.submit(draft));
    const command = state.review!;
    await act(async () => { await state.execute(command); });
    expect(state.notice?.ok).toBe(false);
    expect(state.notice?.text).toContain("재시도");
    expect(state.retry).toEqual(command);
    await act(async () => { await state.execute(state.retry!); });
    expect(f.change.mock.calls[1]![0]).toEqual(f.change.mock.calls[0]![0]);
    expect(state.retry).toBeNull();
  });

  it("clears the previous member's failed request when changing context", async () => {
    f.change.mockResolvedValue({ ok: false, message: "거절" });
    act(() => state.submit(draft));
    await act(async () => { await state.execute(state.review!); });
    act(() => state.cancel());
    expect(state.retry).toBeNull();
    expect(state.notice).toBeNull();
  });

  it("reports an unavailable random source instead of silently stopping", () => {
    vi.stubGlobal("crypto", {});
    act(() => state.submit(draft));
    expect(state.review).toBeNull();
    expect(state.notice?.ok).toBe(false);
    expect(f.change).not.toHaveBeenCalled();
  });
});
