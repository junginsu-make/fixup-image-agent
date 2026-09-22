"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../lib/membership/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { canManageTarget, resolveOwnerEmail, OWNER_PROTECTED_MESSAGE } from "../../../lib/membership/owner";
import { isCreditLedgerEnabled } from "../../../lib/membership/credit-ledger";
import { isLocalAuthBypass } from "../../../lib/dev-auth";

const id = z.string().uuid();
const units = z.number().int().min(1).max(1_000_000);
const money = z.number().int().min(0).max(100_000_000);
const reason = z.string().trim().min(3).max(500);
const Command = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("grant"), users: z.array(id).min(1).max(200), grantKind: z.enum(["purchase", "subscription", "bonus"]), units, amount: money, expires: z.string().datetime().nullable(), reason, action: id }),
  // 전환 한 번은 전역 크레딧 잠금을 쥔 채 돈다 — 그 길이만큼 모든 회원의 생성과
  // 잔액 조회가 멈춘다. DB 상한(50)과 같은 값이어야 화면에서 먼저 막힌다.
  z.object({ kind: z.literal("activate"), users: z.array(id).min(1).max(50), ratio: z.number().positive().max(1000), reviewed: z.literal(true), reason, action: id }),
  z.object({ kind: z.literal("revoke"), user: id, grant: id, reason }),
  z.object({ kind: z.literal("resolve"), user: id, request: id, positions: z.array(z.number().int().min(0).max(59)).max(60), reason, action: id }),
  z.object({ kind: z.literal("plan"), plan: z.string().regex(/^[a-z0-9_-]{1,40}$/), name: z.string().trim().min(1).max(80), units, amount: money, active: z.boolean() }),
  z.object({ kind: z.literal("subscription"), users: z.array(id).min(1).max(200), plan: z.string().min(1).max(40), status: z.enum(["active", "canceled", "suspended"]), action: id }),
  // 승인·정지. 여기서는 **승인 메일을 보내지 않는다** — 수십 명에게 한 요청 안에서
  // 보내면 그 요청이 먼저 죽는다. 다시 보내기는 /admin 에 회원별로 남아 있다.
  z.object({ kind: z.literal("status"), users: z.array(id).min(1).max(200), status: z.enum(["active", "suspended"]), reason, action: id }),
  z.object({ kind: z.literal("paid"), user: id, period: z.string().regex(/^\d{4}-\d{2}-01$/), units, amount: money, action: id }),
]);
export type CreditCommand = z.infer<typeof Command>;

async function context() {
  const actor = await requireAdmin();
  if (isLocalAuthBypass || !isCreditLedgerEnabled()) throw new Error("크레딧 장부 연결이 꺼져 있습니다. 로컬 미리보기에서는 지급할 수 없습니다.");
  return { actor, db: createSupabaseAdminClient() };
}

export async function creditMemberHistory(user: string) {
  id.parse(user);
  const { actor, db } = await context();
  const { data, error } = await db.rpc("credit_admin_history", { p_actor: actor.user.id, p_user: user });
  if (error) throw new Error(error.message);
  return data;
}

export async function changeCredits(input: CreditCommand): Promise<{ ok: boolean; message: string }> {
  try {
    const command = Command.parse(input);
    const { actor, db } = await context();
    const users = "users" in command ? [...new Set(command.users)] : "user" in command ? [command.user] : [];
    if (users.length) {
      const { data, error } = await db.from("profiles").select("id,email").in("id", users);
      if (error || data?.length !== users.length) throw new Error("선택한 회원을 찾지 못했습니다.");
      if (data.some(target => !canManageTarget({ actorEmail: actor.profile.email, targetEmail: target.email, owner: resolveOwnerEmail(process.env.OWNER_EMAIL) }))) throw new Error(OWNER_PROTECTED_MESSAGE);
    }
    // 결과를 버리지 않는다. 일괄 상태 변경은 조건에 안 맞는 회원을 건너뛰므로,
    // 「반영했습니다」만 내면 0명이 바뀌어도 성공으로 읽힌다 — 화면은 몇 명이
    // 바뀌었는지 알려 준다고 적어 두었다.
    const call = async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await db.rpc(name, { ...args, p_actor: actor.user.id });
      if (error) throw new Error(error.message);
      return data;
    };
    let outcome = "반영했습니다.";
    switch (command.kind) {
      case "grant":
        // One DB transaction: the entire selection succeeds or rolls back together.
        await call("credit_admin_grant_many", { p_users: users, p_kind: command.grantKind, p_units: command.units, p_paid_krw: command.amount, p_expires: command.expires, p_source: `admin:${command.action}`, p_reason: command.reason });
        break;
      case "activate":
        await call("credit_admin_activate", { p_users: users, p_ratio: command.ratio, p_reason: command.reason, p_action: command.action, p_reviewed_legacy: command.reviewed }); break;
      case "revoke": {
        const { data, error } = await db.from("credit_grants").select("user_id").eq("id", command.grant).single();
        if (error || data?.user_id !== command.user) throw new Error("지급 기록의 회원이 일치하지 않습니다.");
        await call("credit_admin_revoke", { p_grant: command.grant, p_reason: command.reason }); break;
      }
      case "resolve": await call("credit_admin_resolve", { p_user: command.user, p_request: command.request, p_positions: command.positions, p_reason: command.reason, p_action: command.action }); break;
      case "plan": await call("credit_admin_plan", { p_id: command.plan, p_name: command.name, p_units: command.units, p_price: command.amount, p_active: command.active }); break;
      // 고른 사람 전부가 한 트랜잭션이다. 장부가 못 받는 회원이 하나라도 있으면
      // 절반만 새 플랜으로 남지 않고 통째로 되돌아간다.
      case "subscription": await call("credit_admin_subscription_many", { p_users: users, p_plan: command.plan, p_status: command.status, p_started: new Date().toISOString(), p_cancel: command.status === "canceled" ? new Date().toISOString() : null, p_action: command.action }); break;
      case "status": {
        const moved = await call("credit_admin_member_status", { p_users: users, p_status: command.status, p_reason: command.reason, p_action: command.action });
        const count = Array.isArray(moved) ? moved.length : 0;
        const label = command.status === "active" ? "승인" : "정지";
        outcome = count === users.length
          ? `${count}명을 ${label}했습니다.`
          : `${users.length}명 중 ${count}명을 ${label}했습니다. 나머지는 조건에 맞지 않아 건너뛰었습니다.`;
        break;
      }
      case "paid": await call("credit_admin_confirm_period", { p_user: command.user, p_period: command.period, p_paid: command.amount, p_units: command.units, p_source: `paid:${command.action}` }); break;
    }
    revalidatePath("/admin/members"); revalidatePath("/settings");
    return { ok: true, message: outcome };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "처리하지 못했습니다." }; }
}
