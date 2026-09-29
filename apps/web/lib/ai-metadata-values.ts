/**
 * 파일에 적는 AI 생성 표시의 값.
 *
 * **`server-only` 를 안 붙인다.** 값은 서버 코드가 아니라 자료다. 광고 규격
 * 검사(`lib/ad/check.ts`)가 「이 EXIF 가 우리 표시인가」를 가리려고 이것을
 * 읽는데, 그 파일은 sharp 만 쓰고 서버 전용이 아니다 — `ai-metadata.ts` 에서
 * 그대로 가져가게 했더니 그 시험이 통째로 안 돌았다(2026-09-29).
 *
 * 무엇을 왜 적는지는 `ai-metadata.ts` 머리말에 있다.
 */
export const AI_METADATA = {
  /**
   * 무엇이 만들었나. 뷰어의 「프로그램 이름」에 뜬다.
   *
   * **괄호를 쓰지 않는다.** `FormWith (AI)` 로 적었더니 EXIF 에 `FormWith` 까지만
   * 들어갔다(2026-09-29 실측). 괄호가 값을 끊는다.
   */
  software: "FormWith AI",
  /**
   * 사람이 읽을 설명. **한글을 쓰지 않는다** — EXIF 의 이 칸은 ASCII 라
   * 한글을 넣으면 뷰어마다 깨져 보인다.
   */
  description: "AI-generated image. Created by FormWith.",
  /** 기계가 찾을 표시. IPTC 의 그 값을 그대로 쓴다 — XMP 로 옮길 때 같은 값이다. */
  digitalSourceType: "trainedAlgorithmicMedia",
} as const;
