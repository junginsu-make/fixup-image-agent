import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **멈춤 스위치를 바꾸는 문**(설계 2026-09-30 §3.3).
 *
 * 서버 액션은 주소만 알면 직접 부를 수 있다 — 관리자인지 여기서 다시 본다. 값은 **정확히
 * '1'/'0'** 만 받는다(`credit_reserve` 가 `'1'` 만 멈춤으로 본다). 값 쓰기와 감사 한 줄은 DB 함수
 * 하나가 한 트랜잭션으로 한다.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirected: string[] = [];
vi.mock("next/navigation", () => ({ redirect: (to: string) => { redirected.push(to); } }));

let 관리자다 = true;
vi.mock("../../../lib/membership/server", () => ({
  requireAdmin: async () => {
    if (!관리자다) throw new Error("관리자 권한이 필요합니다.");
    return { user: { id: "admin-1" }, profile: { email: "admin@example.com" } };
  },
}));

const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcError: { message: string } | null = null;
vi.mock("../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: {}, error: rpcError };
    },
  }),
}));

const { setAiPausedAction } = await import("../system/ai-control-actions");
const 누른다 = (paused: string) => {
  const form = new FormData();
  form.set("paused", paused);
  return setAiPausedAction(form);
};

beforeEach(() => {
  calls.length = 0;
  redirected.length = 0;
  rpcError = null;
  관리자다 = true;
});

describe("스위치 바꾸기", () => {
  it("'1' 이면 멈춘다 — 누가 왜 눌렀는지 함께 보낸다", async () => {
    await 누른다("1");
    expect(calls).toEqual([{ fn: "admin_set_ai_paused", args: { p_actor: "admin-1", p_paused: true, p_reason: "관리자 화면에서 AI 전체 멈춤" } }]);
    expect(redirected).toEqual(["/admin/system?notice=ai_paused"]);
  });

  it("'0' 이면 다시 켠다", async () => {
    await 누른다("0");
    expect(calls[0]!.args.p_paused).toBe(false);
    expect(redirected).toEqual(["/admin/system?notice=ai_resumed"]);
  });

  it.each(["", "true", "on", "2"])("모르는 값 %j 는 DB 에 안 보낸다", async (value) => {
    await expect(누른다(value)).rejects.toThrow("올바르지 않은 값");
    expect(calls).toEqual([]);
  });

  it("관리자가 아니면 막는다", async () => {
    관리자다 = false;
    await expect(누른다("1")).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("DB 가 거절하면 알린다 — 바뀐 줄 알고 넘어가지 않게", async () => {
    rpcError = { message: "admin_required" };
    await expect(누른다("1")).rejects.toThrow("AI 멈춤 스위치를 바꾸지 못했습니다");
    expect(redirected).toEqual([]);
  });
});
