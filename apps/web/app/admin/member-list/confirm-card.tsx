"use client";

import { useEffect, useRef } from "react";
import { Button, Card, CardContent } from "@fixup/ui";
import type { CreditCommand } from "../members/actions";
import type { CreditCommandState } from "./use-credit-command";
import { PLAN_STATUS_LABEL } from "./types";

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

/** 반영 전에 사람이 읽는 한 줄. */
/**
 * **누구에게인지 반드시 말한다.** 패널을 옮겨 다니는 사이 다른 회원의 명령이 남아
 * 있으면, 이름 없이 「1명에게 500크레딧」만 보고는 잘못 누른 것을 못 알아챈다
 * (독립 리뷰 2026-09-22).
 */
export function describeCommand(command: CreditCommand, planName: (id: string) => string, emailOf: (id: string) => string): string {
  const who = (users: string[]) => (users.length === 1 ? emailOf(users[0]!) : `${users.length}명`);
  switch (command.kind) {
    case "grant": return `${who(command.users)}에게 ${command.users.length > 1 ? "각각 " : ""}${command.units.toLocaleString("ko-KR")}크레딧 지급 · 받은 금액 ${command.users.length > 1 ? "각각 " : ""}${won(command.amount)}`;
    case "paid": return `${emailOf(command.user)} · ${command.period.slice(0, 7)} 결제 확인 · ${command.units.toLocaleString("ko-KR")}크레딧 지급 · 받은 금액 ${won(command.amount)}`;
    case "subscription": return `${who(command.users)} · ${planName(command.plan)} · ${PLAN_STATUS_LABEL[command.status] ?? command.status}`;
    case "status": return `${who(command.users)}을(를) ${command.status === "active" ? "승인" : "정지"}합니다. 조건에 맞지 않는 회원은 건너뜁니다`;
    case "revoke": return `${emailOf(command.user)} · 선택한 지급 건의 남은 크레딧을 회수합니다`;
    case "resolve": return `${emailOf(command.user)} · ${command.positions.length}개 결과물 전달을 확인하고 나머지 예약은 돌려줍니다`;
    case "plan": return `${command.name} · 매월 ${command.units.toLocaleString("ko-KR")}크레딧 · ${won(command.amount)} · ${command.active ? "판매 중" : "판매 중지"}`;
    case "plan_delete": return `${planName(command.plan)} 플랜을 삭제합니다. 쓰거나 썼던 회원이 있으면 삭제하지 않습니다`;
    case "activate": return `${command.users.length}명 전환`;
  }
}

/** 확인 카드와 결과 알림. 한 화면에 하나만 둔다. */
export function ConfirmCard({ state, planName, emailOf = (id) => id }: { state: CreditCommandState; planName: (id: string) => string; emailOf?: (id: string) => string }) {
  const { review, notice, retry, pending, execute, cancel } = state;
  const box = useRef<HTMLDivElement | null>(null);
  // 확인 카드는 표 위에 뜬다. 40번째 줄에서 누르면 화면 밖이라 아무 일도 안 난 것처럼 보인다.
  useEffect(() => { if (review) box.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [review]);
  return (
    <>
      {review ? (
        <Card ref={box} className="border-2 border-primary" role="region" aria-label="변경 내용 확인">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-bold">반영할 내용을 확인하세요</p>
            <p className="text-sm">{describeCommand(review, planName, emailOf)}</p>
            {"reason" in review ? <p className="text-xs text-muted-foreground">사유: {review.reason}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => execute(review)}>{pending ? "반영 중..." : "확인한 내용 반영"}</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={cancel}>취소</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {notice ? (
        <div role="status" className={`rounded-md border px-4 py-3 text-sm ${notice.ok ? "border-primary/30 bg-primary-soft" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
          {notice.text}
          {retry ? <Button size="sm" variant="outline" className="ml-3" disabled={pending} onClick={() => execute(retry)}>같은 요청으로 재시도</Button> : null}
        </div>
      ) : null}
    </>
  );
}
