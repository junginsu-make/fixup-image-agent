import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("../../../lib/email/approval", () => ({}));
vi.mock("../../../lib/membership/server", () => ({ requireAdmin: async () => ({ user: { id: "admin-id" }, profile: { email: "admin@example.invalid", role: "admin" } }) }));
vi.mock("../../../lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { email: "member@example.invalid", role: "member", status: "active" }, error: null }) }) }) }),
  rpc: state.rpc, auth: { admin: { deleteUser: state.remove } },
}) }));
import { deleteMember } from "../actions";
const id = "11111111-2222-4333-8444-555555555555";
const form = () => { const data = new FormData(); data.set("userId", id); data.set("confirmEmail", "member@example.invalid"); return data; };
beforeEach(() => { state.rpc.mockReset().mockResolvedValue({ data: false, error: null }); state.remove.mockReset().mockResolvedValue({ error: null }); });
it.each(["PGRST202", "42883", "08006"])("확인 함수 조회 실패이면 삭제 API를 호출하지 않는다 (%s)", async code => {
  state.rpc.mockResolvedValue({ data: null, error: { code, message: "DB lookup failed" } });
  await expect(deleteMember(form())).rejects.toThrow("삭제 가능 여부를 확인하지 못했습니다");
  expect(state.remove).not.toHaveBeenCalled();
});
it("빈 응답을 삭제 가능으로 간주하지 않는다", async () => {
  state.rpc.mockResolvedValue({ data: null, error: null });
  await expect(deleteMember(form())).rejects.toThrow("삭제 가능 여부를 확인하지 못했습니다"); expect(state.remove).not.toHaveBeenCalled();
});
it("금전 기록이 있으면 삭제를 막고 정지를 안내한다", async () => {
  state.rpc.mockResolvedValue({ data: true, error: null });
  await expect(deleteMember(form())).rejects.toThrow("대신 정지"); expect(state.remove).not.toHaveBeenCalled();
});
it("기록 없음이 확인된 본 대상만 삭제한다", async () => {
  await deleteMember(form());
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("credit_member_has_records", { p_user: id });
  expect(state.remove).toHaveBeenCalledExactlyOnceWith(id);
});
