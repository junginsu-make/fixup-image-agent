"use client";

import type { ReactNode } from "react";
import { Button, Input } from "@fixup/ui";
import type { CreditCommandState } from "./use-credit-command";

export const SELECT = "h-9 rounded-md border bg-background px-3 text-sm";

export const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
export const number = (form: FormData, key: string) => Number(form.get(key));

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-xs text-muted-foreground">{label}{children}</label>;
}

/**
 * 크레딧 지급. 여러 명에게도, 한 명에게도 같은 폼을 쓴다.
 *
 * 구독 크레딧은 여기서 주지 않는다 — 결제 확인(회원 패널)으로만 준다. 결제가 안 된
 * 달에 크레딧이 나가는 사고를 막으려는 것이다.
 */
export function GrantForm({ users, state }: { users: string[]; state: CreditCommandState }) {
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        const expires = text(f, "expires");
        state.submit({
          kind: "grant", users, grantKind: text(f, "grantKind") as "purchase" | "bonus",
          units: number(f, "units"), amount: number(f, "amount"),
          expires: expires ? new Date(`${expires}T00:00:00+09:00`).toISOString() : null,
          reason: text(f, "reason"), action: crypto.randomUUID(),
        });
      }}
    >
      <Field label="종류">
        <select className={SELECT} name="grantKind">
          <option value="purchase">구매 · 3개월 유효</option>
          <option value="bonus">추가 지급 · 만료일 지정</option>
        </select>
      </Field>
      <Field label="1명당 크레딧"><Input className="w-28 tabular-nums" name="units" type="number" min={1} max={1000000} required /></Field>
      <Field label="1명당 받은 금액(원)"><Input className="w-32 tabular-nums" name="amount" type="number" min={0} defaultValue={0} required /></Field>
      <Field label="추가 지급 만료일"><Input className="w-40" name="expires" type="date" /></Field>
      <Field label="사유"><Input className="w-48" name="reason" minLength={3} required placeholder="예: 9월 입금 확인" /></Field>
      <Button type="submit" size="sm" disabled={state.pending || !users.length}>지급 내용 확인</Button>
    </form>
  );
}
