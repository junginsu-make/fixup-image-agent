"use client";

import { Info } from "lucide-react";
import { applyDesignSystem, sectionPlanGaps, sectionsMissingDesignSystem } from "@fixup/pdp-core";
import type { DesignSystem, SectionBlueprint } from "@fixup/pdp-core";
import { Button } from "@fixup/ui";

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

export function SectionPlanGaps({
  sections,
  designSystem,
  onSectionsChange,
}: {
  sections: SectionBlueprint[];
  /** 페이지 공용 디자인. 있으면 **모든 섹션이 받았는지** 함께 본다(U-15). */
  designSystem?: DesignSystem;
  /**
   * 놓친 섹션을 맞춰 준다. 없으면 버튼을 안 띄운다.
   *
   * **말만 하고 고칠 길을 안 주면 안 된다.** `style_guide` 는 화면에서 고칠 수
   * 없어서, 「N개 섹션이 공용 디자인을 받지 않았습니다」는 읽고 넘길 수밖에 없는
   * 말이 된다. 맞추는 것은 값이 안 드는 순수 함수다.
   */
  onSectionsChange?: (sections: SectionBlueprint[]) => void;
}) {
  const gaps = sectionPlanGaps(sections);
  /*
    **어느 섹션이 공용 디자인 없이 만들어질지** 본다.

    섹션 이미지는 서로를 모른 채 각각 생성된다. 한 섹션만 그 서술을 놓치면 그
    장면만 다른 서체·다른 인물로 나오고, **이미지가 나온 뒤에야** 보인다.
    한 장에 값이 드는데 그때는 이미 늦다.
  */
  const 디자인놓친섹션 = sectionsMissingDesignSystem(sections, designSystem);

  if (gaps.length === 0 && 디자인놓친섹션.length === 0) return null;

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
        {디자인놓친섹션.length > 0 ? (
          <li className="text-sm text-muted-foreground">
            {`${디자인놓친섹션.length}개 섹션이 페이지 공용 디자인(서체·색·등장인물)을 받지 않았습니다. 그 섹션만 다른 모습으로 만들어집니다.`}
          </li>
        ) : null}
      </ul>

      {디자인놓친섹션.length > 0 && designSystem && onSectionsChange ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => onSectionsChange(sections.map((section) => applyDesignSystem(section, designSystem)))}
        >
          모든 섹션에 페이지 디자인 적용
        </Button>
      ) : null}

      {gaps.length > 0 ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          아래에서 직접 고칠 수 있습니다. 고치지 않고 진행해도 됩니다.
        </p>
      ) : null}
    </div>
  );
}
