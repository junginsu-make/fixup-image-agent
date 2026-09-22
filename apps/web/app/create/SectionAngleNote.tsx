"use client";

import { explainAngleForSection } from "@fixup/pdp-core";
import { characterAngleLabel } from "../../lib/character-library";

/**
 * 이 섹션에 **어느 각도가 갈지, 왜 그런지** 보여준다(U-05).
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * 자동은 **낱말 대조**다. 그런데 어느 낱말이 걸렸는지는 아무 데도 안 보여서,
 * 사용자는 「AI 가 알아서 골랐겠지」 하고 넘긴다. 그러다 이미지가 나온 뒤에야
 * 뒷모습이 나온 것을 보고 놀란다.
 *
 * **아무 낱말도 안 걸린 경우를 보여 주는 것이 더 중요하다.** 그때는 기본값
 * 하나로 굳는데, 그 사실을 모르면 「장면 설명을 고치면 각도가 바뀌겠지」 하고
 * 헛수고한다.
 *
 * 각도를 직접 고른 사용자에게는 안 띄운다 — 자동이 안 도는 자리다.
 */

export function SectionAngleNote({
  layoutNotes,
  characterId,
  pickedAngles,
}: {
  /** 섹션의 장면·구성 설명. 자동이 이것을 본다. */
  layoutNotes?: string;
  /** 캐릭터를 안 골랐으면 각도 이야기를 할 것이 없다. */
  characterId?: string;
  /** 직접 고른 각도. 있으면 자동이 안 돈다. */
  pickedAngles?: string[];
}) {
  if (!characterId || (pickedAngles?.length ?? 0) > 0) return null;

  const 고른것 = explainAngleForSection(layoutNotes ?? "");
  const 각도 = characterAngleLabel(고른것.angle);

  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {고른것.reason === "keyword"
        /*
          **어느 칸에서 찾았는지 못 박는다.** 그냥 「설명」이라고 하면 사용자는
          바로 위 「이미지 방향」을 고치고, 각도가 안 바뀌는 것을 이해 못 한다.

          「…」 뒤에 조사를 붙이면 받침에 따라 을/를이 갈린다. 고정된 낱말 뒤에 붙인다.
        */
        ? `이 섹션에는 캐릭터의 ${각도} 그림이 갑니다. 레이아웃 메모에서 「${고른것.matched}」 낱말을 찾았습니다.`
        : `이 섹션에는 캐릭터의 ${각도} 그림이 갑니다. 레이아웃 메모에 각도를 가리키는 낱말이 없어 기본값을 씁니다. 바꾸려면 메모에 적거나 위에서 각도를 직접 고르세요.`}
    </p>
  );
}
