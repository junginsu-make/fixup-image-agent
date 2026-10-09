"use client";

import { useState, type ReactNode } from "react";
import { Button, Input } from "@fixup/ui";
import type { CreditCommandState } from "./use-credit-command";

export const SELECT = "h-9 rounded-md border bg-background px-3 text-sm";

export const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
export const number = (form: FormData, key: string) => Number(form.get(key));

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`grid min-w-0 gap-1 text-xs text-muted-foreground ${className}`}>{label}{children}</label>;
}

/**
 * 크레딧 지급. 여러 명에게도, 한 명에게도 같은 폼을 쓴다.
 *
 * 구독 크레딧은 여기서 주지 않는다 — 구독을 배정하면 그 자리에서, 그 뒤로는 매달 배정한
 * 날에 저절로 들어간다(2026-10-09). 여기서도 주면 같은 기간이 두 번 나간다.
 */
export function GrantForm({ users, state }: { users: string[]; state: CreditCommandState }) {
  const [kind, setKind] = useState<"purchase" | "bonus">("purchase");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        const expires = text(f, "expires");
        state.submit({
          kind: "grant", users, grantKind: text(f, "grantKind") as "purchase" | "bonus",
          units: number(f, "units"), amount: number(f, "amount"),
          expires: expires ? new Date(`${expires}T00:00:00+09:00`).toISOString() : null,
          reason: text(f, "reason"),
        });
      }}
    >
      <fieldset disabled={state.pending || !users.length} className="flex flex-wrap items-end gap-3">
      <Field label="지급 종류" className="w-full sm:w-44">
        <select className={`${SELECT} w-full`} name="grantKind" value={kind} onChange={(event) => setKind(event.target.value as "purchase" | "bonus")}>
          <option value="purchase">구매 · 3개월 유효</option>
          <option value="bonus">추가 지급 · 만료일 지정</option>
        </select>
      </Field>
      <Field label="1명당 크레딧" className="w-full sm:w-24"><Input className="w-full tabular-nums" name="units" type="number" min={1} max={1000000} step={1} required /></Field>
      <Field label="1명당 받은 금액(원)" className="w-full sm:w-36"><Input className="w-full tabular-nums" name="amount" type="number" min={0} max={100000000} step={1} defaultValue={0} required /></Field>
      {kind === "bonus" ? <Field label="만료일 · 해당일 0시" className="w-full sm:w-36"><Input className="w-full" name="expires" type="date" min={new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })} required /></Field> : null}
      <Field label="지급 사유" className="w-full sm:w-56"><Input className="w-full" name="reason" minLength={3} maxLength={500} required placeholder="예: 입금 확인 / 이벤트 지급" /></Field>
      <Button type="submit" size="sm" className="w-full shrink-0 sm:w-auto" disabled={state.pending || !users.length}>{state.pending ? "지급 처리 중..." : "지급 내용 확인"}</Button>
      </fieldset>
      <p className="text-xs text-muted-foreground">{kind === "purchase" ? "구매 크레딧은 지급일부터 3개월간 사용할 수 있습니다." : "추가 크레딧은 지정한 만료일까지 사용할 수 있습니다."} 확인 화면에서 회원과 수량을 확인한 뒤 반영합니다.</p>
    </form>
  );
}
