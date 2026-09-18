"use client";

import { Info } from "lucide-react";
import { sectionPlanGaps } from "@fixup/pdp-core";
import type { SectionBlueprint } from "@fixup/pdp-core";

/**
 * 구성안에서 **빠진 것**을 알린다.
 *
 * 장수 강제를 풀었으니(U-14) 모자란 구성도 그대로 통과한다. 설계 §9.1 이
 * 「최소 1섹션도 의도된 구성이라면 허용하되 **필수 정보 부족을 검사한다**」고
 * 적은 자리다.
 *
 * **막지 않는다. 말할 뿐이다.** 적은 장수가 의도된 구성일 수도 있다. 그리고
 * 사용자가 아래에서 고치면 이 상자는 저절로 사라진다 — 서버가 준 값이 아니라
 * 지금 화면의 구성안을 보고 있어서다.
 */

export function SectionPlanGaps({ sections }: { sections: SectionBlueprint[] }) {
  const gaps = sectionPlanGaps(sections);
  if (gaps.length === 0) return null;

  return (
    <div className="mb-4 rounded-md border border-border bg-muted/30 p-3.5">
      <div className="mb-1.5 flex items-center gap-2">
        <Info size={14} className="shrink-0 text-muted-foreground" />
        <span className="text-sm font-bold">구성안에서 빠진 것이 있습니다</span>
      </div>
      <ul className="grid gap-1">
        {gaps.map((gap) => (
          <li key={gap.kind} className="text-sm text-muted-foreground">
            {gap.message}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-sm text-muted-foreground">
        아래에서 직접 고칠 수 있습니다. 고치지 않고 진행해도 됩니다.
      </p>
    </div>
  );
}
