"use client";

import { useState } from "react";
import { Button, Input } from "@fixup/ui";
import type { AdminMemberRow, CreditPlan } from "./types";
import type { CreditCommandState } from "./use-credit-command";
import { Field, GrantForm, SELECT, text } from "./forms";

type Mode = "grant" | "plan" | "cancel" | "status";
const MODES: { id: Mode; label: string }[] = [
  { id: "grant", label: "크레딧 지급" },
  { id: "plan", label: "플랜 부여·변경" },
  { id: "cancel", label: "플랜 해지" },
  { id: "status", label: "승인·정지" },
];

/** 고른 회원에게 한꺼번에. 명령 하나가 DB 트랜잭션 하나다 — 전부 되거나 전부 안 된다. */
export function BulkBar({ rows, plans, state, onClear }: { rows: AdminMemberRow[]; plans: CreditPlan[]; state: CreditCommandState; onClear: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const users = rows.map((row) => row.profile.id);
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{users.length}명 선택</span>
        {MODES.map((entry) => (
          <Button key={entry.id} size="sm" aria-pressed={mode === entry.id} variant={mode === entry.id ? "default" : "outline"} onClick={() => setMode(mode === entry.id ? null : entry.id)}>
            {entry.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={onClear}>선택 해제</Button>
      </div>
      {mode === "grant" ? <GrantForm users={users} state={state} /> : null}
      {mode === "plan" ? <PlanForm users={users} plans={plans} state={state} /> : null}
      {mode === "cancel" ? <CancelForm rows={rows} state={state} /> : null}
      {mode === "status" ? <StatusForm users={users} state={state} /> : null}
    </div>
  );
}

function PlanForm({ users, plans, state }: { users: string[]; plans: CreditPlan[]; state: CreditCommandState }) {
  const selling = plans.filter((plan) => plan.active);
  if (!selling.length) return <p className="text-sm text-muted-foreground">판매 중인 플랜이 없습니다. 시스템 관리 탭에서 먼저 만드세요.</p>;
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      state.submit({ kind: "subscription", users, plan: text(new FormData(event.currentTarget), "plan"), status: "active", action: crypto.randomUUID() });
    }}>
      <Field label="플랜">
        <select className={SELECT} name="plan" required>
          {selling.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · 월 {plan.monthly_units}크레딧 · {plan.price_krw.toLocaleString("ko-KR")}원</option>)}
        </select>
      </Field>
      <Button type="submit" size="sm" disabled={state.pending}>부여 내용 확인</Button>
      <p className="basis-full text-xs text-muted-foreground">플랜만 붙습니다. 크레딧은 회원 패널의 「결제 확인」에서 그 달 결제를 확인해야 지급됩니다.</p>
    </form>
  );
}

/**
 * 해지는 **같은 플랜끼리만** 한꺼번에 한다. DB 함수가 플랜 하나를 받아 전원에게
 * 적기 때문에, 섞어 보내면 다른 플랜 회원의 기록이 그 플랜으로 바뀐다.
 */
function CancelForm({ rows, state }: { rows: AdminMemberRow[]; state: CreditCommandState }) {
  const plans = [...new Set(rows.map((row) => row.credit?.planId ?? null))];
  if (plans.includes(null)) return <p className="text-sm text-muted-foreground">플랜이 없는 회원이 섞여 있습니다. 플랜이 있는 회원만 고르세요.</p>;
  if (plans.length > 1) return <p className="text-sm text-muted-foreground">플랜이 서로 다른 회원이 섞여 있습니다. 같은 플랜끼리 해지하세요.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="destructive" disabled={state.pending} onClick={() => state.submit({ kind: "subscription", users: rows.map((row) => row.profile.id), plan: plans[0]!, status: "canceled", action: crypto.randomUUID() })}>
        해지 내용 확인
      </Button>
      <p className="text-xs text-muted-foreground">해지하면 새 결제 확인을 할 수 없습니다. 이미 지급된 크레딧과, 미리 결제 확인해 둔 달의 크레딧은 그대로 지급·사용됩니다.</p>
    </div>
  );
}

function StatusForm({ users, state }: { users: string[]; state: CreditCommandState }) {
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      const f = new FormData(event.currentTarget);
      state.submit({ kind: "status", users, status: text(f, "status") as "active" | "suspended", reason: text(f, "reason"), action: crypto.randomUUID() });
    }}>
      <Field label="바꿀 상태">
        <select className={SELECT} name="status"><option value="active">승인</option><option value="suspended">정지</option></select>
      </Field>
      <Field label="사유"><Input className="w-48" name="reason" minLength={3} required /></Field>
      <Button type="submit" size="sm" disabled={state.pending}>변경 내용 확인</Button>
      <p className="basis-full text-xs text-muted-foreground">이메일 인증을 마친 회원만 승인됩니다. 승인 메일은 보내지 않습니다. 필요하면 회원별 「⋯」에서 보내세요.</p>
    </form>
  );
}
