import type { PdpOutputMode, SectionBlueprint } from "./types";

/**
 * 이 섹션 그림에 **실제로 그리는 글자**.
 *
 * ── 왜 한 곳에 모으나 ─────────────────────────────────────────
 *
 * 생성과 QA 가 각자 다른 목록을 보고 있었다.
 *
 *   신뢰문구 — 한때 그림에 그렸는데 QA 는 **안 봤다** → 그 한 줄이 「승인 안 된
 *              글자」로 잡혀 멀쩡한 그림을 다시 만들었다. 지금은 **양쪽 다 안
 *              싣는다**(2026-09-23 사용자: 완성본 밑에 설명 한 줄이 박혀 나왔다).
 *              편집기의 카피 목록에서 글자로 얹을 수는 있다.
 *   CTA      — 그림에는 **안 그린다**(2026-07-30 사용자 결정: 눌리지 않는 그림
 *              버튼이 되고 섹션마다 반복되면 페이지가 버튼 나열이 된다).
 *              QA 는 **승인 원고로 봤다** → 없는 문구를 기준으로 삼았다.
 *
 * 설계 §10.2 가 「생성과 QA 는 동일 `ApprovedCopy` 를 사용한다」고 못 박은 자리다.
 * 목록을 두 벌 두면 한쪽만 고치는 날이 오고, 그날 QA 는 엉뚱한 것을 잡는다.
 */

export interface ApprovedCopy {
  headline?: string;
  subheadline?: string;
  bullets: string[];
}

const 값이있으면 = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function approvedCopyOf(
  section: SectionBlueprint,
  options: { outputMode?: PdpOutputMode } = {},
): ApprovedCopy {
  /*
    **글자 없는 그림에는 승인 원고가 없다.**

    편집 모드는 사진만 만들고 카피는 편집기에서 얹는다. 그 그림에 원고를 들이대면
    QA 가 「제목이 안 보인다」를 결함으로 잡는다 — 안 그리기로 한 것인데.
  */
  if (options.outputMode === "editable") return { bullets: [] };

  return {
    headline: 값이있으면(section.headline),
    subheadline: 값이있으면(section.subheadline),
    bullets: (section.bullets ?? []).map((bullet) => bullet?.trim()).filter((bullet): bullet is string => Boolean(bullet)),
  };
}
