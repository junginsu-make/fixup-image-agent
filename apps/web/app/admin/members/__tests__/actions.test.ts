import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ rpc: vi.fn(), requireAdmin: vi.fn(), actor: "10000000-0000-4000-8000-000000000001", user: "10000000-0000-4000-8000-000000000002", targetEmail: "member@example.invalid" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../lib/dev-auth", () => ({ isLocalAuthBypass: false }));
vi.mock("../../../../lib/membership/credit-ledger", () => ({ isCreditLedgerEnabled: () => true }));
vi.mock("../../../../lib/membership/server", () => ({ requireAdmin: f.requireAdmin }));
vi.mock("../../../../lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: f.rpc, from: () => ({ select: () => ({ in: async () => ({ data: [{ id: f.user, email: f.targetEmail }] }), eq: () => ({ single: async () => ({ data: { user_id: f.user } }) }) }) }) }) }));
import { changeCredits, type CreditCommand } from "../actions";
const sql = ["202609220001_credit_ledger_v2.sql", "202609220004_credit_plan_delete.sql"]
  .map(name => readFileSync(new URL(`../../../../../../supabase/migrations/${name}`, import.meta.url), "utf8")).join("\n");
const action = "20000000-0000-4000-8000-000000000001";
describe("관리자 입력에서 실제 SQL까지", () => {
  beforeEach(() => {
    f.rpc.mockReset(); f.requireAdmin.mockReset();
    f.requireAdmin.mockResolvedValue({ user: { id: f.actor }, profile: { email: "admin@example.invalid" } });
    f.targetEmail = "member@example.invalid";
    // 플랜 삭제는 결과를 읽는다. 다른 명령은 data 를 안 본다.
    f.rpc.mockResolvedValue({ data: { deleted: true, members: 0 }, error: null });
  });
  it("모든 변경이 실존하는 SQL 인자와 인증된 actor를 사용한다", async () => {
    const commands: CreditCommand[] = [
      { kind:"grant", users:[f.user], grantKind:"purchase", units:100, amount:10000, expires:null, reason:"입금 확인", action },
      { kind:"activate", users:[f.user], ratio:5, reviewed:true, reason:"잔액 확인", action },
      { kind:"revoke", user:f.user, grant:action, reason:"입금 취소" },
      { kind:"resolve", user:f.user, request:action, positions:[0], reason:"저장 결과 확인", action },
      { kind:"plan", plan:"test", name:"시험", units:100, amount:10000, active:true },
      { kind:"subscription", users:[f.user], plan:"test", status:"active", action },
      { kind:"paid", user:f.user, period:"2026-09-01", units:100, amount:10000, action },
      { kind:"status", users:[f.user], status:"suspended", reason:"이용 약관 위반", action },
      { kind:"plan_delete", plan:"test" },
    ];
    for (const command of commands) expect(await changeCredits(command)).toMatchObject({ ok:true });
    for (const [name,args] of f.rpc.mock.calls) {
      const signature = sql.match(new RegExp(`function public\\.${name}\\(([^)]*)\\)`))?.[1];
      expect(signature,name).toBeTruthy();
      const names = signature!.split(",").map(p => p.trim().split(" ")[0]);
      expect(Object.keys(args).sort(),name).toEqual(names.sort());
      expect(args.p_actor).toBe(f.actor);
    }
  });
  /*
    소유자 보호가 이 화면에도 걸리는지 아무도 안 보고 있었다. 일괄 명령이 늘면서
    `users` 를 뽑는 줄(`actions.ts` 의 users 추출)이 유일한 관문이 되었는데, 그
    줄을 건드리면 조용히 뚫린다 — 관리자를 되살리는 길은 화면에 없다.
  */
  it("소유자 계정은 다른 관리자가 일괄로도 못 건드린다", async () => {
    const previous = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = "owner@example.invalid";
    f.targetEmail = "owner@example.invalid";
    try {
      const result = await changeCredits({ kind:"status", users:[f.user], status:"suspended", reason:"시험", action });
      expect(result.ok).toBe(false);
      expect(f.rpc).not.toHaveBeenCalled();
    } finally { process.env.OWNER_EMAIL = previous; }
  });

  it("인증 실패 시 DB를 호출하지 않는다", async () => {
    f.requireAdmin.mockRejectedValue(new Error("admin required"));
    expect(await changeCredits({ kind:"plan", plan:"test", name:"시험", units:100, amount:10000, active:true })).toMatchObject({ ok:false });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  /** 쓰거나 썼던 회원이 있으면 DB 가 지우지 않고 몇 명인지 돌려준다. 성공으로 읽으면 안 된다. */
  it("쓰는 회원이 있는 플랜은 삭제 실패와 인원을 알린다", async () => {
    f.rpc.mockResolvedValue({ data: { deleted: false, members: 3 }, error: null });
    const result = await changeCredits({ kind:"plan_delete", plan:"basic" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("3명");
    expect(result.message).toContain("판매 중지");
  });
  it("음수 지급은 DB 호출 전에 거절한다", async () => {
    expect(await changeCredits({ kind:"grant", users:[f.user], grantKind:"purchase", units:-1, amount:0, expires:null, reason:"입력 오류", action })).toMatchObject({ ok:false });
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
