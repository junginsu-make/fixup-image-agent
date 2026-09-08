"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, cn } from "@fixup/ui";
import { adSubmitPlan, type AdSubmitPlan } from "./ad-mode";
import { planDerivation } from "../../lib/ad/derive";
import { PORTAL_LABEL, actionNotices, defaultSelection, missingRequiredCount, specRows } from "../ad/export-rules";
import { ActionNotices } from "../ad/action-notices";

/**
 * 광고 규격을 고르는 칸.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §9 · §10 3-c
 *
 * **별도 파일인 이유는 번들이다.** 초판은 이것이 `new-client.tsx` 안에 있었고,
 * `AD_SPECS`(249줄)·`derive`·`export-rules` 가 **스위치와 무관하게 모든 포스터
 * 사용자의 번들에 실렸다.** 광고와 상관없는 사람이 이 화면의 대부분인데
 * 「기존 시스템에 영향 없음」이라고 말할 수 없다.
 *
 * 부모가 `next/dynamic` 으로 들이므로, **스위치가 꺼져 있으면 이 조각을 아예
 * 안 내려받는다.**
 *
 * 고른 규격은 여기 있고 부모는 **판단 결과만** 받는다 — 부모가 `adPicked` 를
 * 들면 규격 목록을 다시 알아야 해서 잘라 낸 의미가 없어진다.
 */

/** 목록은 상수에서 나온다. 그릴 때마다 다시 셀 이유가 없다. */
const ROWS = specRows(planDerivation);

export default function AdSpecPicker({
  onPlanChange,
}: {
  onPlanChange: (plan: AdSubmitPlan, picked: string[]) => void;
}) {
  const [picked, setPicked] = React.useState<string[]>(() => defaultSelection(ROWS));
  const plan = adSubmitPlan(picked);
  const missingRequired = missingRequiredCount(ROWS, picked);

  // 부모는 「만들 수 있는가」와 「몇 장인가」만 알면 된다.
  const report = React.useRef(onPlanChange);
  report.current = onPlanChange;
  React.useEffect(() => { report.current(adSubmitPlan(picked), picked); }, [picked]);

  return (
    <fieldset className="grid gap-2">
      <legend className="text-meta text-subtle-foreground">광고 규격</legend>
      <ul className="grid gap-1">
        {ROWS.map((row) => (
          <li key={row.spec.id}>
            <label
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1.5 text-sm",
                row.supported ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="checkbox"
                checked={picked.includes(row.spec.id)}
                disabled={!row.supported}
                onChange={() => setPicked((current) => current.includes(row.spec.id)
                  ? current.filter((id) => id !== row.spec.id)
                  : [...current, row.spec.id])}
              />
              <span className="text-subtle-foreground">{PORTAL_LABEL[row.spec.portal]}</span>
              <span>{row.spec.label}</span>
              {/* **`/ad` 와 같은 모양이어야 한다.** 같은 규격 목록인데 한쪽은
                  배지, 한쪽은 회색 글씨면 다른 것으로 읽힌다. */}
              {row.spec.required && <Badge variant="secondary">필수</Badge>}
              {/* 미검증 규격임을 데이터가 말한다(설계 §11). 화면이 감추면 안 된다. */}
              {row.spec.sourceKind === "reference" && (
                <Badge variant="outline">참고</Badge>
              )}
              {!row.supported && (
                <span className="text-meta text-subtle-foreground">— {row.unsupportedReason}</span>
              )}
            </label>
          </li>
        ))}
      </ul>

      {/*
        **「만들 그림 N장」을 항상 보여 준다**(설계 §9 원칙 2). 규격을 10개 골라도
        생성은 두세 장이라는 것이 이 기능의 핵심인데, 안 보여 주면 사용자는
        10배 과금을 걱정한다.
      */}
      <p className="text-meta">
        <strong>만들 그림 {plan.masters.length}장</strong>
        {" · "}내보낼 규격 {picked.length}개
      </p>

      {/*
        **이후에 사람이 할 일.** `/ad` 와 같은 함수·같은 상자를 쓴다 — 같은
        규격 목록인데 두 화면이 다른 말을 하면 그게 더 나쁘다.
      */}
      <ActionNotices notices={actionNotices(picked, planDerivation)} />

      {missingRequired > 0 && (
        <p className="text-meta text-destructive" role="alert">
          필수 규격 {missingRequired}개가 꺼져 있습니다. 빠지면 포털이 반려할 수 있습니다.
        </p>
      )}
      {/*
        **못 만드는 이유는 언제나 말한다.** 초판은 `picked.length > 0` 일 때만
        띄워서, 규격을 전부 끄면 **아무 문구 없이 버튼만 잠겼다** — 왜 안 되는지
        알 길이 없었다.
      */}
      {!plan.ready && (
        <p className="text-meta text-destructive" role="alert">{plan.reason}</p>
      )}
      <p className="text-meta text-subtle-foreground">
        만든 뒤 <Link href="/ad" className="underline">광고 규격으로 내보내기</Link>에서 규격을 뽑습니다.
      </p>
    </fieldset>
  );
}
