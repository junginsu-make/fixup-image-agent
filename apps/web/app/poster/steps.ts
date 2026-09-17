import type { StepDefinition } from "@fixup/ui";
import type { PromptMode } from "./prompt-mode";

/**
 * 이미지 만들기의 단계 — **한 벌뿐이다.**
 *
 * 전에는 새로 만들기 화면과 열어 보기 화면이 각자 목록을 들고 있었다. 앞쪽은
 * 셋, 뒤쪽은 다섯이라 같은 기능인데 진행 막대가 달라 보였고, 새로 만드는
 * 사람은 앞으로 뭐가 남았는지 알 수 없었다.
 */
/**
 * **지시가 맨 앞이다.**
 *
 * 예전 차례는 「01 레퍼런스 → 02 규격 → 03 지시」였다. 첫 칸이 「따라 만들
 * 이미지」라서 글만 들고 온 사람은 시작조차 못 했다(2026-09-16 사용자 보고).
 * 엔진은 진작부터 글만으로 그릴 줄 알았다 — `pickEndpoint` 가 첨부 유무로
 * t2i·i2i 를 갈라 부른다. 막고 있던 것은 이 차례와 버튼 규칙뿐이었다.
 *
 * **레퍼런스가 규격보다 앞이다.** 「예상 비용」은 규격 칸에서 보여 주는데, 값이
 * 모드마다 다르다(`poster-core/pricing.ts`). 그림을 붙이고 나서 봐야 실제로
 * 청구될 값이 나온다.
 */
export const POSTER_STEPS: StepDefinition[] = [
  { id: "instruction", label: "01 지시", desc: "무엇을 만들까" },
  { id: "reference", label: "02 레퍼런스", desc: "따라 만들 이미지 · 선택" },
  { id: "spec", label: "03 규격", desc: "비율 · 모델 · 장수" },
  { id: "plan", label: "04 기획 확인", desc: "틀린 칸만 고치기" },
  { id: "result", label: "05 결과", desc: "고르고 검수" },
];

/**
 * 작업을 만들기 전에 갈 수 있는 단계.
 *
 * 04·05 는 작업이 있어야 열린다 — AI 초안도 결과도 만든 뒤에 생긴다. 그래도
 * 막대에는 보여 준다. 앞에 뭐가 남았는지 아는 것과 거기로 갈 수 있는 것은
 * 다른 문제다.
 */
const BEFORE_CREATE = new Set(["instruction", "reference", "spec"]);

export function reachableBeforeCreate(id: string): boolean {
  return BEFORE_CREATE.has(id);
}

/**
 * 이 작업이 실제로 지나는 단계들.
 *
 * **「그대로 생성」은 04 를 건너뛴다**(설계 §3.2). 그 갈래는 기획 LLM 을 안
 * 돌리므로 슬롯이 비어 있고 채울 일도 없다. 고칠 것이 없는 자리를 막대에
 * 내보이면, 눌러 들어간 사람이 **빈 칸만 보고** 무엇을 해야 할지 모른다.
 *
 * **번호는 다시 매기지 않는다.** 04 를 빼고 결과를 「04」로 바꾸면 같은 화면을
 * 두 사람이 다른 번호로 부르게 된다. 이름표는 무엇을 하는 자리인지 가리키는
 * 것이지 몇 번째인지 세는 것이 아니다.
 *
 * 안 고른 작업(옛 작업)은 지금까지대로 다섯 단계다(설계 §9).
 */
export function posterSteps(promptMode?: PromptMode): StepDefinition[] {
  if (promptMode !== "verbatim") return POSTER_STEPS;
  return POSTER_STEPS.filter((step) => step.id !== "plan");
}

/**
 * 작업을 연 사람이 **지금 서 있는 단계.**
 *
 * 그대로 생성은 04 가 없으므로 만든 직후에도 05 에 선다. 없는 단계를 가리키면
 * 막대가 아무 곳도 안 밝혀 어디쯤 왔는지 알 수 없다.
 */
export function currentPosterStep(input: {
  hasImages: boolean;
  promptMode?: PromptMode;
}): string {
  if (input.hasImages) return "result";
  return input.promptMode === "verbatim" ? "result" : "plan";
}
