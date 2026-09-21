/**
 * **일괄 생성이 왜 멈췄는지 화면에서 사라졌다**(F-7-3 의 「오류 표시」).
 *
 * 「나머지 섹션 생성」은 자기 자신을 한 장씩 다시 부른다. 그래서 여덟 장
 * 채우기는 요청 여덟 번이고 분석도 여덟 번이다. 한 번 실패하면 이렇게 됐다.
 *
 *   1. 안쪽이 `setToast("업로드한 자료를 분석하지 못했습니다…")`
 *   2. 곧바로 바깥이 `setToast("일괄 생성 결과: 성공 4장 · 확인 필요 1장…")`
 *
 * **2 가 1 을 덮는다.** 사용자는 「확인 필요 1장」만 읽고 **왜** 멈췄는지는
 * 못 본다 — 분석이 실패했다는 사실을 끊어 알리려고 한 일이 기본 경로에서
 * 통째로 증발한다.
 *
 * 그래서 이유를 **앞에** 붙이고 숫자를 뒤에 둔다. 사람이 먼저 읽어야 하는
 * 것은 숫자가 아니라 이유다.
 */

export type BatchSummaryInput = {
  /** 만들려고 한 장수. */
  requested: number;
  /** 실제로 만들어진 장수. */
  completed: number;
  /** 멈춘 이유. 안쪽 생성이 남긴 말. */
  reason?: string;
};

export function batchSummaryMessage({ requested, completed, reason }: BatchSummaryInput): string {
  const 다했다 = completed >= requested;
  const 미시도 = Math.max(0, requested - completed - 1);

  const 숫자 = 다했다
    ? `일괄 생성 결과: 성공 ${completed}장.`
    : `일괄 생성 결과: 성공 ${completed}장 · 확인 필요 1장${미시도 > 0 ? ` · 미시도 ${미시도}장` : ""}.`;

  const 차감 = "성공한 이미지만 차감됐습니다.";

  // 이유가 있으면 먼저 말한다. 없으면(취소 등) 전과 같다.
  const 이유 = 다했다 ? "" : String(reason || "").trim();
  return 이유 ? `${이유} ${숫자} ${차감}` : `${숫자} ${차감}`;
}
