"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@fixup/ui";
import { TeamCell } from "../team-cell";
import { BulkBar } from "./bulk-bar";
import { ConfirmCard } from "./confirm-card";
import { CreditPanel } from "./credit-panel";
import { MemberActions, StatusBadge } from "./row-actions";
import type { AdminMemberRow, CreditPlan } from "./types";
import { PLAN_STATUS_LABEL } from "./types";
import { useCreditCommand } from "./use-credit-command";

type TeamOption = { id: string; name: string };
const count = (value: number) => value.toLocaleString("ko-KR");
// 서버와 브라우저가 같은 날짜를 그려야 한다. 시간대를 안 박으면 새벽에 가입한 회원의
// 날짜가 둘 사이에서 달라져 화면 전체가 다시 그려진다.
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "");

/**
 * 회원 관리 탭의 표.
 *
 * 전에는 회원 목록(`/admin`)과 크레딧 관리(`/admin/members`)가 두 화면이었다. 한
 * 회원의 승인과 플랜을 보려면 오가야 했다(2026-09-22 사용자 지적). 이제 한 줄에
 * 승인·크레딧·플랜이 같이 있고, 「플랜·크레딧」을 누르면 그 회원 패널이 열린다.
 */
export function MemberTable({ rows, plans, teams, ledger }: { rows: AdminMemberRow[]; plans: CreditPlan[]; teams: TeamOption[]; ledger: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const state = useCreditCommand(() => setVersion((value) => value + 1));
  const panel = useRef<HTMLDivElement | null>(null);
  const planName = (id: string) => plans.find((plan) => plan.id === id)?.name ?? id;
  const emailOf = (id: string) => rows.find((row) => row.profile.id === id)?.profile.email ?? id;
  const focus = rows.find((row) => row.profile.id === focusId && row.credit);
  const picked = rows.filter((row) => selected.includes(row.profile.id));
  const toggle = (id: string, on: boolean) => setSelected((list) => (on ? [...list, id] : list.filter((entry) => entry !== id)));
  /*
    **다른 회원을 열면 반영 대기 중이던 명령을 버린다.** 안 버리면 B 의 패널을 보면서
    A 에게 보낼 명령을 반영하게 된다(독립 리뷰 2026-09-22).
  */
  const open = (id: string) => { state.cancel(); setFocusId(id); setVersion((value) => value + 1); };
  const close = () => { state.cancel(); setFocusId(null); };
  // 쪽이나 거르기가 바뀌면 고른 것도 버린다. 안 보이는 회원이 선택된 채로 남는다.
  const ids = rows.map((row) => row.profile.id).join(",");
  useEffect(() => { setSelected([]); }, [ids]);
  useEffect(() => { if (focusId) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [focusId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => exportCsv(rows, planName)}>이 쪽 CSV 받기</Button></div>
      {ledger && picked.length ? <BulkBar rows={picked} plans={plans} state={state} onClear={() => setSelected([])} /> : null}
      <ConfirmCard state={state} planName={planName} emailOf={emailOf} />
      {focus ? <div ref={panel}><CreditPanel key={focus.profile.id} row={focus} plans={plans} state={state} version={version} onClose={close} /></div> : null}

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <MobileCard key={row.profile.id} row={row} teams={teams} ledger={ledger} planName={planName}
            checked={selected.includes(row.profile.id)} onCheck={(on) => toggle(row.profile.id, on)} onOpen={() => open(row.profile.id)} />
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              {ledger ? (
                <th className="w-8 py-3 pr-2">
                  <input type="checkbox" aria-label="이 쪽 회원 모두 선택" checked={rows.length > 0 && selected.length === rows.length}
                    onChange={(event) => setSelected(event.target.checked ? rows.map((row) => row.profile.id) : [])} />
                </th>
              ) : null}
              {["회원", "팀", "상태", "크레딧", "플랜", "이번 달", "비용", "관리"].map((label) => <th key={label} className="py-3 pr-3 font-medium">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <DesktopRow key={row.profile.id} row={row} teams={teams} ledger={ledger} planName={planName}
                checked={selected.includes(row.profile.id)} onCheck={(on) => toggle(row.profile.id, on)} onOpen={() => open(row.profile.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 이 쪽의 회원을 CSV 로. 엑셀이 수식으로 읽는 첫 글자(= + - @)는 막는다. */
function exportCsv(rows: AdminMemberRow[], planName: (id: string) => string) {
  const cell = (value: unknown) => `"${String(value ?? "").replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const header = ["이메일", "상태", "팀", "사용 가능 크레딧", "처리 중", "확인 대기", "이번 달 사용 크레딧", "이번 달 이미지", "플랜", "플랜 상태", "이번 달 비용", "누적 비용"];
  const body = rows.map((row) => [
    row.profile.email, row.profile.status, row.team?.teamName ?? "",
    row.credit ? (row.credit.unlimited ? "무제한" : row.credit.available) : "", row.credit?.reserved ?? "", row.credit?.reviewUnits ?? "",
    row.credit?.used ?? "", row.monthImages, row.credit?.planId ? planName(row.credit.planId) : "", row.credit?.planStatus ?? "",
    row.monthCost, row.totalCost,
  ]);
  const csv = "\uFEFF" + [header, ...body].map((line) => line.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "members.csv"; link.click();
  URL.revokeObjectURL(url);
}

type RowProps = { row: AdminMemberRow; teams: TeamOption[]; ledger: boolean; planName: (id: string) => string; checked: boolean; onCheck: (on: boolean) => void; onOpen: () => void };

function Identity({ row }: { row: AdminMemberRow }) {
  const { profile } = row;
  return (
    <>
      {/* `<p>` 가 아니라 `<div>` 다. `Badge` 가 `<div>` 라 `<p>` 안에 넣으면 hydration 오류가 난다. */}
      <div className="flex flex-wrap items-center gap-1.5 break-all font-medium">
        {profile.email}
        {profile.role === "admin" ? <Badge variant="secondary">운영자</Badge> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {profile.email_confirmed_at ? "이메일 인증" : "미인증"} · 가입 {day(profile.created_at)}
        {profile.approved_at ? ` · 승인 ${day(profile.approved_at)}` : ""}
      </p>
    </>
  );
}

function CreditCell({ row }: { row: AdminMemberRow }) {
  const credit = row.credit;
  if (!credit) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      <span className="font-bold tabular-nums">{credit.unlimited ? "무제한" : `${count(credit.available)}`}</span>
      {credit.reserved > 0 ? <span className="block text-xs text-muted-foreground tabular-nums">처리 중 {count(credit.reserved)}</span> : null}
      {credit.reviewUnits > 0 ? <span className="block text-xs text-amber-700">확인 대기 {count(credit.reviewUnits)}</span> : null}
    </>
  );
}

function PlanCell({ row, planName }: { row: AdminMemberRow; planName: (id: string) => string }) {
  const credit = row.credit;
  if (!credit?.planId) return <span className="text-muted-foreground">없음</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-medium">{planName(credit.planId)}</span>
      <Badge variant={credit.planStatus === "active" ? "green" : "secondary"}>{PLAN_STATUS_LABEL[credit.planStatus ?? ""] ?? credit.planStatus}</Badge>
    </div>
  );
}

function MonthCell({ row }: { row: AdminMemberRow }) {
  return (
    <>
      <span className="font-medium tabular-nums">{row.credit ? `${count(row.credit.used)}크레딧` : `${count(row.monthImages)}장`}</span>
      {row.credit ? <span className="block text-xs text-muted-foreground tabular-nums">{count(row.monthImages)}장</span> : null}
    </>
  );
}

function CostCell({ row }: { row: AdminMemberRow }) {
  return (
    <>
      <span className="font-medium tabular-nums">{row.monthCost}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">누적 {row.totalCost} · {count(row.totalImages)}장</span>
    </>
  );
}

function Manage({ row, ledger, onOpen, fullWidth = false }: { row: AdminMemberRow; ledger: boolean; onOpen: () => void; fullWidth?: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-1.5">
      {ledger && row.credit ? <Button size="sm" variant="outline" className={fullWidth ? "w-full" : undefined} onClick={onOpen}>플랜·크레딧</Button> : null}
      <MemberActions profile={row.profile} fullWidth={fullWidth} />
    </div>
  );
}

function DesktopRow({ row, teams, ledger, planName, checked, onCheck, onOpen }: RowProps) {
  return (
    <tr className="border-b align-top">
      {ledger ? <td className="py-4 pr-2"><input type="checkbox" aria-label={`${row.profile.email} 선택`} checked={checked} onChange={(event) => onCheck(event.target.checked)} /></td> : null}
      <td className="py-4 pr-3"><Identity row={row} /></td>
      <td className="py-4 pr-3"><TeamCell userId={row.profile.id} email={row.profile.email} team={row.team} teams={teams} /></td>
      <td className="py-4 pr-3"><StatusBadge profile={row.profile} /></td>
      <td className="py-4 pr-3"><CreditCell row={row} /></td>
      <td className="py-4 pr-3"><PlanCell row={row} planName={planName} /></td>
      <td className="py-4 pr-3"><MonthCell row={row} /></td>
      <td className="py-4 pr-3"><CostCell row={row} /></td>
      <td className="py-4"><Manage row={row} ledger={ledger} onOpen={onOpen} /></td>
    </tr>
  );
}

function MobileCard({ row, teams, ledger, planName, checked, onCheck, onOpen }: RowProps) {
  const cells: [string, React.ReactNode][] = [
    ["크레딧", <CreditCell key="c" row={row} />],
    ["플랜", <PlanCell key="p" row={row} planName={planName} />],
    ["이번 달", <MonthCell key="m" row={row} />],
    ["비용", <CostCell key="k" row={row} />],
  ];
  return (
    <article className="rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {ledger ? <input className="mt-1" type="checkbox" aria-label={`${row.profile.email} 선택`} checked={checked} onChange={(event) => onCheck(event.target.checked)} /> : null}
          <div className="min-w-0"><Identity row={row} /></div>
        </div>
        <StatusBadge profile={row.profile} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {cells.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1">{value}</dd>
          </div>
        ))}
        <div className="col-span-2 rounded-lg bg-muted/50 p-3">
          <dt className="text-xs text-muted-foreground">팀</dt>
          <dd className="mt-1"><TeamCell userId={row.profile.id} email={row.profile.email} team={row.team} teams={teams} /></dd>
        </div>
      </dl>
      <div className="mt-4 border-t pt-4"><Manage row={row} ledger={ledger} onOpen={onOpen} fullWidth /></div>
    </article>
  );
}
