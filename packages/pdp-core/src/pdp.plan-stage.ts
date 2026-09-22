/**
 * **기획이 지금 어디쯤인가.**
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 *
 * 사진을 올리고 기획이 끝날 때까지 **4분 가까이** 걸린다. 그동안 화면은
 * 「AI가 상세페이지 구조를 만드는 중입니다」 한 줄로 버틴다. 사용자는
 * 「막연하게 너무 지루하게 기다리기만 한다」고 했다(2026-09-22).
 *
 * ── 왜 시간으로 안 세는가 ──────────────────────────────────
 *
 * 「2분 지났으니 검수 중이겠지」는 **추측이다.** 모델이 늦으면 아직 구성안을
 * 짜는 중인데 화면은 검수 중이라고 말한다. 이 저장소는 가짜 퍼센트를 이미
 * 한 번 거절했다(`pdp-indeterminate`: 「가짜 퍼센트를 보여주는 것보다
 * 정직하다」). 같은 이유로 **실제로 넘어갈 때만** 알린다.
 *
 * 그래서 코어가 단계를 넘을 때마다 소리를 내고, 서버가 그것을 받아 두고,
 * 화면이 물어본다.
 *
 * ── 이 파일은 이름과 말만 갖는다 ───────────────────────────
 *
 * 저장·전달은 서버가, 그리는 것은 화면이 한다. 코어는 순수해야 한다.
 */

/** 기획이 지나는 자리들. 순서대로다. */
export const PLAN_STAGES = [
  "reference",
  "blueprint",
  "review",
  "revise",
  "recheck",
  "finish",
] as const;

export type PdpPlanStage = (typeof PLAN_STAGES)[number];

/**
 * 사용자에게 보이는 말.
 *
 * **「~하는 중입니다」로 끝낸다.** 화면이 이 문장을 그대로 띄운다.
 */
export const PLAN_STAGE_LABEL: Record<PdpPlanStage, string> = {
  reference: "참고로 올린 인물 사진을 읽는 중입니다.",
  blueprint: "사진에서 제품을 읽고 구성안을 짜는 중입니다.",
  review: "만든 구성안을 검수하는 중입니다.",
  revise: "검수에서 지적받은 곳을 고쳐 쓰는 중입니다.",
  recheck: "고쳐 쓴 구성안을 다시 검수하는 중입니다.",
  finish: "마무리하는 중입니다.",
};

/**
 * 목록에 거는 짧은 이름.
 *
 * 위의 문장은 **지금 하는 일**을 말하고, 이쪽은 **차례표의 한 줄**이다. 한
 * 벌로 쓰면 목록이 「~하는 중입니다」로 도배된다.
 */
export const PLAN_STAGE_STEP: Record<PdpPlanStage, string> = {
  reference: "인물 사진 읽기",
  blueprint: "제품 읽고 구성안 짜기",
  review: "구성안 검수",
  revise: "지적받은 곳 고쳐 쓰기",
  recheck: "다시 검수",
  finish: "마무리",
};

/**
 * **늘 지나는 자리인가, 필요할 때만인가.**
 *
 * 화면은 늘 지나는 자리를 미리 목록으로 펴 둔다. 그래야 얼마나 남았는지
 * 보인다. 건너뛸 수 있는 자리는 **실제로 시작할 때만** 목록에 끼운다 —
 * 미리 보여 주면 안 하고 지나갔을 때 사용자가 무엇이 잘못된 줄 안다.
 */
export const ALWAYS_PASSED: readonly PdpPlanStage[] = ["blueprint", "review", "finish"];

export function isPlanStage(value: unknown): value is PdpPlanStage {
  return typeof value === "string" && (PLAN_STAGES as readonly string[]).includes(value);
}

/** 앞에서 몇 번째인가. 목록을 그릴 때 「여기까지 왔다」를 가른다. */
export function planStageOrder(stage: PdpPlanStage): number {
  return PLAN_STAGES.indexOf(stage);
}
