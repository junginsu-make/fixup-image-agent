import { overLimitFields, type LongInstructionKey } from "@fixup/pdp-core";

/**
 * **만들기 요청이 싣는 칸이 넘쳤는가.**
 *
 * ── 왜 따로 있나 ─────────────────────────────────────────────
 *
 * 기획 화면의 문지기(`overLimit`)는 **기획 요청이 싣는 칸**만 본다. 그런데
 * 「이미지 연출 요청」과 첨부 지시 세 칸은 `buildPageWire` 를 거쳐 **만들기
 * 요청에만** 간다.
 *
 * 처음에는 이 칸들을 기획 문지기에 넣었다가 리뷰가 잡았다 — **반대쪽 문에
 * 걸려 있었다.** 기획을 엉뚱하게 막으면서, 정작 그 칸을 싣는 만들기는 그대로
 * 서버까지 가서 「요청이 올바르지 않습니다」 한 줄로 400 이 났다.
 *
 * ── 어디서 고치는지까지 말한다 ──────────────────────────────
 *
 * 이 칸들은 **시나리오 화면에 입력란이 없다.** 그래서 막기만 하면 사용자가
 * 풀 길이 없다. 어느 칸이 얼마나 넘쳤는지와 **어느 화면에서 고치는지**를
 * 함께 말한다.
 *
 * 상한이 늦게 붙은 칸들이라, 그 전에 저장된 초안이 넘친 값을 담고 복원될 수
 * 있다. U-08 에서 같은 함정에 한 번 빠졌다.
 */
export function imageRequestLengthBlock(
  fields: Partial<Record<LongInstructionKey, string | undefined>>,
): string {
  const over = overLimitFields({} as never, undefined, undefined, fields);
  if (!over.length) return "";

  const 목록 = over.map((field) => `${field.label} ${field.length - field.limit}자 초과`).join(", ");
  return `${목록}. 기획 화면에서 줄인 뒤 다시 눌러 주세요.`;
}
