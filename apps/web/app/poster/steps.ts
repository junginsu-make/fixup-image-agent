import type { StepDefinition } from "@fixup/ui";

/**
 * 이미지 만들기의 단계 — **한 벌뿐이다.**
 *
 * 전에는 새로 만들기 화면과 열어 보기 화면이 각자 목록을 들고 있었다. 앞쪽은
 * 셋, 뒤쪽은 다섯이라 같은 기능인데 진행 막대가 달라 보였고, 새로 만드는
 * 사람은 앞으로 뭐가 남았는지 알 수 없었다.
 */
export const POSTER_STEPS: StepDefinition[] = [
  { id: "reference", label: "01 레퍼런스", desc: "따라 만들 이미지" },
  { id: "spec", label: "02 규격", desc: "비율 · 모델 · 장수" },
  { id: "instruction", label: "03 지시", desc: "한 줄만" },
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
const BEFORE_CREATE = new Set(["reference", "spec", "instruction"]);

export function reachableBeforeCreate(id: string): boolean {
  return BEFORE_CREATE.has(id);
}
