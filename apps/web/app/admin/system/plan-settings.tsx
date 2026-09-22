"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@fixup/ui";
import { ConfirmCard } from "../member-list/confirm-card";
import { Field, number, text } from "../member-list/forms";
import type { CreditPlan } from "../member-list/types";
import { useCreditCommand, type CreditCommandState } from "../member-list/use-credit-command";

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

/**
 * 구독 플랜 설정. 만들기·고치기·판매 중지·삭제.
 *
 * **플랜을 만들어도 회원에게 크레딧이 나가지 않는다.** 회원에게 플랜을 붙이고
 * 그 달 결제를 확인해야 나간다(회원 관리 탭). 삭제는 쓰거나 썼던 회원이 없을
 * 때만 된다(202609220004) — 있으면 판매 중지를 쓴다.
 */
export function PlanSettings({ plans, enabled }: { plans: CreditPlan[]; enabled: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const state = useCreditCommand(() => { setEditing(null); setAdding(false); });
  const planName = (id: string) => plans.find((plan) => plan.id === id)?.name ?? id;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>구독 플랜</CardTitle>
          <CardDescription>플랜을 만들어도 크레딧이 바로 나가지 않습니다. 회원 관리 탭에서 플랜을 붙이고 그 달 결제를 확인해야 지급됩니다.</CardDescription>
        </div>
        {enabled ? <Button size="sm" variant={adding ? "outline" : "default"} onClick={() => setAdding(!adding)}>{adding ? "닫기" : "플랜 추가"}</Button> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? <p className="text-sm text-muted-foreground">크레딧 장부가 꺼진 서버입니다. 운영 서버에서 관리하세요.</p> : null}
        <ConfirmCard state={state} planName={planName} />
        {adding ? <PlanForm state={state} taken={plans.map((plan) => plan.id)} /> : null}
        {plans.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>{["플랜", "월 크레딧", "월 가격", "1크레딧당", "상태", "관리"].map((label) => <th key={label} className="py-3 pr-3 font-medium">{label}</th>)}</tr>
              </thead>
              <tbody>
                {plans.map((plan) => editing === plan.id ? (
                  <tr key={plan.id} className="border-b"><td colSpan={6} className="py-4"><PlanForm plan={plan} state={state} onCancel={() => setEditing(null)} /></td></tr>
                ) : (
                  <PlanRow key={plan.id} plan={plan} state={state} onEdit={() => setEditing(plan.id)} />
                ))}
              </tbody>
            </table>
          </div>
        ) : enabled ? <p className="py-6 text-center text-sm text-muted-foreground">등록된 플랜이 없습니다.</p> : null}
      </CardContent>
    </Card>
  );
}

function PlanRow({ plan, state, onEdit }: { plan: CreditPlan; state: CreditCommandState; onEdit: () => void }) {
  const toggle = () => state.submit({ kind: "plan", plan: plan.id, name: plan.name, units: plan.monthly_units, amount: plan.price_krw, active: !plan.active });
  return (
    <tr className="border-b align-middle">
      <td className="py-3 pr-3"><span className="font-medium">{plan.name}</span><span className="ml-2 text-xs text-muted-foreground">{plan.id}</span></td>
      <td className="py-3 pr-3 tabular-nums">{plan.monthly_units.toLocaleString("ko-KR")}</td>
      <td className="py-3 pr-3 tabular-nums">{won(plan.price_krw)}</td>
      <td className="py-3 pr-3 tabular-nums text-muted-foreground">{plan.monthly_units ? won(Math.round(plan.price_krw / plan.monthly_units)) : "—"}</td>
      <td className="py-3 pr-3"><Badge variant={plan.active ? "green" : "secondary"}>{plan.active ? "판매 중" : "판매 중지"}</Badge></td>
      <td className="py-3">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={state.pending} onClick={onEdit}>수정</Button>
          <Button size="sm" variant="outline" disabled={state.pending} onClick={toggle}>{plan.active ? "판매 중지" : "판매 재개"}</Button>
          <Button size="sm" variant="destructive" disabled={state.pending} onClick={() => state.submit({ kind: "plan_delete", plan: plan.id })}>삭제</Button>
        </div>
      </td>
    </tr>
  );
}

/** 새 플랜이면 id 를 받고, 있는 플랜이면 id 는 고정이다 — 회원 구독이 id 로 플랜을 가리킨다. */
function PlanForm({ plan, state, onCancel, taken = [] }: { plan?: CreditPlan; state: CreditCommandState; onCancel?: () => void; taken?: string[] }) {
  const [clash, setClash] = useState("");
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3" onSubmit={(event) => {
      event.preventDefault();
      const f = new FormData(event.currentTarget);
      /*
        DB 는 같은 ID 가 오면 그 플랜을 **덮어쓴다**(`on conflict do update`). 추가하려다
        판매 중인 플랜의 이름·가격을 조용히 바꾸면 안 된다 — 고치려면 「수정」을 쓴다.
      */
      if (!plan && taken.includes(text(f, "plan"))) { setClash("이미 있는 플랜 ID입니다. 그 플랜을 바꾸려면 표에서 「수정」을 누르세요."); return; }
      setClash("");
      state.submit({ kind: "plan", plan: plan?.id ?? text(f, "plan"), name: text(f, "name"), units: number(f, "units"), amount: number(f, "amount"), active: f.get("active") === "on" });
    }}>
      {plan ? null : <Field label="플랜 ID (영문 소문자)"><Input className="w-36" name="plan" pattern="[a-z0-9_-]+" required placeholder="basic" /></Field>}
      <Field label="플랜 이름"><Input className="w-36" name="name" defaultValue={plan?.name} required placeholder="Basic" /></Field>
      <Field label="월 크레딧"><Input className="w-28 tabular-nums" name="units" type="number" min={1} max={1000000} defaultValue={plan?.monthly_units} required /></Field>
      <Field label="월 가격(원)"><Input className="w-32 tabular-nums" name="amount" type="number" min={0} defaultValue={plan?.price_krw} required /></Field>
      <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={plan?.active ?? true} />판매 중</label>
      <Button type="submit" size="sm" disabled={state.pending}>저장 내용 확인</Button>
      {onCancel ? <Button type="button" size="sm" variant="ghost" onClick={onCancel}>취소</Button> : null}
      {clash ? <p role="alert" className="basis-full text-sm text-destructive">{clash}</p> : null}
    </form>
  );
}
