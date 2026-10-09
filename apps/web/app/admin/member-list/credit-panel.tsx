"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@fixup/ui";
import { creditMemberHistory } from "../members/actions";
import type { AdminMemberRow, CreditPlan } from "./types";
import { PLAN_STATUS_LABEL } from "./types";
import type { CreditCommandState } from "./use-credit-command";
import { Field, GrantForm, SELECT, text } from "./forms";
import { MemberInfo } from "./member-info";
import { needsOnboarding } from "../../../lib/membership/onboarding";

type Grant = { id: string; source_key?: string; kind: string; granted_units: number; consumed_units: number; reserved_units: number; expires_at: string; revoked_at: string | null; reason: string };
type Pending = { request_id: string; operation: string; requested_units: number; credit_phase: string; credit_quote: { outputs: number[] } };
type Audit = { id: string; action: string; reason: string; created_at: string };
type History = { grants: Grant[]; pending: Pending[]; audit: Audit[] };

const KIND: Record<string, string> = { subscription: "구독", purchase: "구매", bonus: "추가 지급" };
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "—");
/*
  배정 = 지급(2026-10-09 사용자 결정). 전에는 배정 뒤 그 달 「결제 확인」을 따로 눌러야 크레딧이
  나갔고 그 달 말일에 사라졌다. 이제 배정하면 바로 들어가고, 켜져 있는 동안 매달 배정일에 다시 들어간다.
*/
export const SUBSCRIPTION_HINT =
  "플랜을 배정하면 그 자리에서 플랜만큼 크레딧이 들어가고, 배정한 날부터 한 달 동안 씁니다. " +
  "구독이 켜져 있는 동안 매달 배정한 날에 다시 들어갑니다. 다른 플랜으로 바꾸면 이전 플랜의 남은 크레딧은 거둬들이고 새 플랜 크레딧을 줍니다. " +
  "입금이 끊기면 「플랜 해지」를 눌러야 다음 달 지급이 멈춥니다.";

/** 회원 한 명의 플랜·크레딧. 표에서 「플랜·크레딧」을 누르면 열린다. */
export function CreditPanel({ row, plans, state, onClose, version }: { row: AdminMemberRow; plans: CreditPlan[]; state: CreditCommandState; onClose: () => void; version: number }) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const hasCredit = Boolean(row.credit);
  useEffect(() => {
    // 크레딧 장부가 없는 회원(로컬 미리보기)은 이력을 안 읽는다.
    if (!hasCredit) return;
    let live = true;
    // 새로 읽는 동안 앞 사람의 이력(회수·정산 폼 포함)을 남겨 두지 않는다.
    setError(""); setHistory(null);
    creditMemberHistory(row.profile.id)
      .then((data) => { if (live) setHistory(data as History); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "이력을 읽지 못했습니다."); });
    return () => { live = false; };
  }, [row.profile.id, hasCredit, version]);

  return (
    <Card role="region" aria-label={`${row.profile.email} 플랜·크레딧`}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="truncate">{row.profile.email}</CardTitle>
        <Button size="sm" variant="outline" disabled={state.pending} onClick={onClose}>닫기</Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {row.credit ? <>
          <CreditSections row={row} plans={plans} state={state} history={history} error={error} />
          <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-bold">회원 정보·비밀번호 관리</summary><div className="mt-4"><MemberInfo key={row.profile.id} row={row} /></div></details>
        </> : <MemberInfo key={row.profile.id} row={row} />}
      </CardContent>
    </Card>
  );
}

function CreditSections({ row, plans, state, history, error }: { row: AdminMemberRow; plans: CreditPlan[]; state: CreditCommandState; history: History | null; error: string }) {
  if (needsOnboarding(row.profile)) return <p className="text-sm text-muted-foreground">가입 정보를 아직 확인하지 않은 회원입니다. 회원이 가입을 완료한 뒤 크레딧을 지급할 수 있습니다.</p>;
  return (
    <>
        <Section title="크레딧·플랜"><Summary row={row} plans={plans} /></Section>
        <Section title="크레딧 지급" hint="구독과 별도로 주는 크레딧입니다. 구매분은 3개월 동안 쓸 수 있습니다.">
          <GrantForm users={[row.profile.id]} state={state} />
        </Section>
        <Section title="월 구독" hint={SUBSCRIPTION_HINT}>
          <div className="space-y-2 rounded-lg border bg-muted/20 p-4"><PlanControls row={row} plans={plans} state={state} /></div>
        </Section>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {!history && !error ? <p className="text-sm text-muted-foreground">이력을 불러오는 중입니다.</p> : null}
        {history?.pending.length ? <Section title="확인이 필요한 작업"><PendingJobs row={row} jobs={history.pending} state={state} /></Section> : null}
        {history ? <Section title="지급 이력"><Grants row={row} grants={history.grants} state={state} /></Section> : null}
        {history?.audit.length ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">관리자 변경 기록</summary>
            <ul className="mt-2 space-y-1">{history.audit.map((event) => <li key={event.id} className="text-xs text-muted-foreground">{day(event.created_at)} · {event.action} · {event.reason}</li>)}</ul>
          </details>
        ) : null}
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="text-sm font-bold">{title}</h3>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </section>
  );
}

function Summary({ row, plans }: { row: AdminMemberRow; plans: CreditPlan[] }) {
  const credit = row.credit!;
  const plan = plans.find((entry) => entry.id === credit.planId);
  const items: [string, string][] = [
    ["사용 가능", credit.unlimited ? "무제한" : `${credit.available.toLocaleString("ko-KR")}크레딧`],
    ["처리 중", `${credit.reserved.toLocaleString("ko-KR")}크레딧`],
    ["이번 달 사용", `${credit.used.toLocaleString("ko-KR")}크레딧`],
    ["플랜", plan ? `${plan.name} · ${PLAN_STATUS_LABEL[credit.planStatus ?? ""] ?? credit.planStatus}` : "없음"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-muted/50 p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlanControls({ row, plans, state }: { row: AdminMemberRow; plans: CreditPlan[]; state: CreditCommandState }) {
  const credit = row.credit!;
  const selling = plans.filter((plan) => plan.active || plan.id === credit.planId);
  const users = [row.profile.id];
  if (!selling.length) return <p className="text-sm text-muted-foreground">판매 중인 플랜이 없습니다. 시스템 관리 탭에서 먼저 만드세요.</p>;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        state.submit({ kind: "subscription", users, plan: text(new FormData(event.currentTarget), "plan"), status: "active" });
      }}>
        <Field label={credit.planId ? "플랜 변경" : "플랜 부여"}>
          <select className={`${SELECT} max-w-full`} name="plan" defaultValue={credit.planId ?? selling[0]!.id} required disabled={state.pending}>
            {selling.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · 월 {plan.monthly_units}크레딧 · {plan.price_krw.toLocaleString("ko-KR")}원</option>)}
          </select>
        </Field>
        <Button type="submit" size="sm" disabled={state.pending}>{credit.planId ? "변경 내용 확인" : "부여 내용 확인"}</Button>
      </form>
      {credit.planId && credit.planStatus !== "canceled" ? (
        <Button size="sm" variant="destructive" disabled={state.pending} onClick={() => state.submit({ kind: "subscription", users, plan: credit.planId!, status: "canceled" })}>
          플랜 해지
        </Button>
      ) : null}
    </div>
  );
}

function PendingJobs({ row, jobs, state }: { row: AdminMemberRow; jobs: Pending[]; state: CreditCommandState }) {
  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <form key={job.request_id} className="space-y-2 rounded-lg border p-3" onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          state.submit({ kind: "resolve", user: row.profile.id, request: job.request_id, positions: f.getAll("position").map(Number), reason: text(f, "reason") });
        }}>
          <p className="text-sm">{job.operation} · {job.requested_units}크레딧 · 결과 확인 필요</p>
          <p className="text-xs text-muted-foreground">실제로 전달한 결과만 고르세요. 하나도 안 고르면 전부 돌려줍니다.</p>
          <div className="flex flex-wrap gap-3">
            {job.credit_quote.outputs.map((units, i) => <label key={i} className="flex items-center gap-1 text-sm"><input type="checkbox" name="position" value={i} />{i + 1}번 ({units}크레딧)</label>)}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="확인 근거"><Input className="w-64" name="reason" minLength={3} required /></Field>
            <Button type="submit" size="sm" disabled={state.pending}>정산 내용 확인</Button>
          </div>
        </form>
      ))}
    </div>
  );
}

function Grants({ row, grants, state }: { row: AdminMemberRow; grants: Grant[]; state: CreditCommandState }) {
  if (!grants.length) return <p className="text-sm text-muted-foreground">지급 이력이 없습니다.</p>;
  return (
    <ul className="space-y-2">
      {grants.map((grant) => {
        const unlimited = grant.source_key?.startsWith("unlimited:");
        // 회수했거나 만료된 지급분은 더 쓸 수 없다. 남은 수를 그대로 보이면 쓸 수 있는 것처럼 읽힌다.
        const live = !grant.revoked_at && new Date(grant.expires_at).getTime() > Date.now();
        const left = live ? grant.granted_units - grant.consumed_units - grant.reserved_units : 0;
        return (
          <li key={grant.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{unlimited ? "무제한" : KIND[grant.kind] ?? grant.kind}</Badge>
              <span className="tabular-nums">
                {unlimited ? `사용 ${grant.consumed_units.toLocaleString("ko-KR")}` : `지급 ${grant.granted_units.toLocaleString("ko-KR")} · 남음 ${left.toLocaleString("ko-KR")} · 만료 ${day(grant.expires_at)}`}
              </span>
              {grant.revoked_at ? <Badge variant="destructive">회수됨</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{grant.reason}</p>
            {live ? (
              <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(event) => {
                event.preventDefault();
                state.submit({ kind: "revoke", user: row.profile.id, grant: grant.id, reason: text(new FormData(event.currentTarget), "reason") });
              }}>
                <Input className="h-8 w-56" name="reason" aria-label="회수 사유" placeholder="회수 사유" minLength={3} required />
                <Button type="submit" size="sm" variant="outline" disabled={state.pending || grant.reserved_units > 0}>남은 크레딧 회수</Button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
