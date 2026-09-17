/**
 * 만든 작업의 **지난 단계로 돌아갈 때, 누른 단계로 바로 연다.**
 *
 * 결과 화면에서 01~03 을 누르면 그 작업의 값을 들고 새로 만드는 화면으로 간다
 * (`?from=`). 그런데 **어느 단계를 눌렀는지는 안 들고 가서**, 「03 규격」을
 * 눌러도 늘 01 이 열렸다(2026-09-17 사용자 보고). 이미지 만들기와 카드뉴스가
 * 같은 길을 쓰므로 규칙을 여기 하나에 둔다.
 */

/** 돌아갈 주소. 작업 id 는 인코딩한다 — 주소를 깨뜨릴 글자가 들어올 수 있다. */
export function rerunHref(base: string, projectId: string, step: string): string {
  return `${base}?from=${encodeURIComponent(projectId)}&step=${encodeURIComponent(step)}`;
}

/**
 * 처음 열 단계.
 *
 * **아는 단계만 연다.** 주소는 누구나 고칠 수 있다 — 모르는 값을 그대로 쓰면
 * 새로 만드는 화면에 없는 단계(04·05)가 켜져 아무것도 안 그려진다. 모르거나
 * 안 적혀 있으면 첫 단계다. 옛 주소(`?from=` 만 있는 것)도 그대로 열린다.
 */
export function rerunStartStep<Step extends string>(
  requested: string | null | undefined,
  allowed: readonly Step[],
  fallback: Step,
): Step {
  return allowed.find((step) => step === requested) ?? fallback;
}
