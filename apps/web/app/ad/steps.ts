import type { StepDefinition } from "@fixup/ui";

/**
 * 광고 규격 내보내기의 단계.
 *
 * **다른 도구와 같은 모양으로 둔다**(운영자 요청 2026-09-11). 포스터·SNS·
 * 상세페이지·리디자인은 전부 `StepBar` 로 한 단계씩 보여 주는데 이 화면만
 * 카드 셋을 한 페이지에 쌓아 뒀다. 같은 시스템 안에서 화면마다 진행 방식이
 * 다르면 사용자는 매번 다시 배운다.
 *
 * **어느 단계로든 자유롭게 간다.** `StepBar` 에 `allowJump` 을 안 넘기면
 * 그렇게 된다 — 포스터는 04·05 가 작업을 만든 뒤에야 생겨서 막아 뒀지만,
 * 이 화면은 **새로 만들지 않는다.** 세 단계 모두 언제든 열려 있어도 되고,
 * 되돌아가 다른 그림을 고르는 일이 잦다.
 */
export const AD_STEPS: StepDefinition[] = [
  { id: "pick", label: "01 그림 고르기", desc: "만들어 둔 것에서 한 장" },
  { id: "portal", label: "02 어디에 올릴까요", desc: "포털 · 규격" },
  { id: "result", label: "03 확인하고 내려받기", desc: "눈으로 보고 봉투에" },
];

export type AdStepId = (typeof AD_STEPS)[number]["id"];
