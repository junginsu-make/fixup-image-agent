/**
 * **어느 장이 왜 안 만들어졌는지 말한다**(F-7-8).
 *
 * ── 무엇이 문제였나 ─────────────────────────────────────────
 *
 * 코어는 이미 이유를 만든다. 실패한 섹션에는 제공자가 준 말이, **시도조차 못
 * 한 섹션**에는 「앞 섹션이 실패해 시도하지 않았습니다」가 붙는다
 * (`packages/redesign-core/src/generate.ts`).
 *
 * 그런데 `failedSections` 라는 낱말이 **코어와 그 시험 밖에는 저장소 전체에
 * 0건**이었다. 화면의 `Project` 타입에 칸조차 없었다.
 *
 * 사용자가 보는 것은 집계 숫자뿐이었다 — 「성공 4장 · 실패 1장 · 미시도 3장」.
 * **어느 장이 왜 빠졌는지 알 길이 없어** 여덟 장을 통째로 다시 만든다. 그때
 * 이미 만든 넉 장 값이 또 나간다.
 *
 * 설계 §14.6: 「failedSections 미표시·토스트만 존재 | **영구 상태·섹션별
 * 실패/미시도 이유 표시**」.
 */

export type FailedSection = {
  section_id?: string;
  name?: string;
  error?: string;
};

export type FailedSectionLine = {
  /** 「S3 베네핏 3개」처럼 사람이 읽는 이름. */
  label: string;
  /** 왜 안 만들어졌나. */
  reason: string;
  /** 시도조차 못 한 것인가. 실패와 다르게 다루어야 한다. */
  skipped: boolean;
};

/** 코어가 시도조차 못 한 섹션에 붙이는 말. 그 말로 둘을 가른다. */
const SKIPPED_MARK = "시도하지 않았습니다";

const 까닭없음 = "까닭을 알 수 없습니다. 이 섹션만 다시 만들어 보세요.";

/**
 * 실패 목록을 화면에 그릴 줄로 바꾼다.
 *
 * **모양이 아닌 것이 섞여 와도 안 터진다.** 이 값은 서버 응답에서 오고,
 * 저장된 작업에서도 온다 — 옛 작업에는 이 칸이 아예 없다.
 */
export function failedSectionLines(
  sections: readonly FailedSection[] | undefined | null,
): FailedSectionLine[] {
  if (!Array.isArray(sections)) return [];

  return sections
    .filter((section): section is FailedSection => Boolean(section) && typeof section === "object")
    .map((section) => {
      const id = String(section.section_id ?? "").trim();
      const name = String(section.name ?? "").trim();
      const reason = String(section.error ?? "").trim();

      return {
        // 번호도 이름도 없으면 사용자가 가리킬 것이 없다. 아래에서 버린다.
        label: name || id,
        reason: reason || 까닭없음,
        skipped: reason.includes(SKIPPED_MARK),
      };
    })
    .filter((line) => Boolean(line.label));
}

/**
 * 이어 만든 뒤의 실패 목록.
 *
 * **성공한 섹션의 줄은 지운다.** 리디자인은 한 장씩 나눠 부르므로, S3 이
 * 실패한 뒤 S3 만 다시 만들어 성공하면 그 줄이 없어져야 한다. 안 없어지면
 * 다 만들고도 「실패 1장」이 남는다.
 *
 * **같은 섹션이 두 줄로 남지 않는다.** 새로 온 까닭이 이긴다 — 옛 까닭은
 * 지난 번 이야기다.
 */
export function mergeFailedSections(
  previous: readonly FailedSection[] | undefined | null,
  incoming: readonly FailedSection[] | undefined | null,
  succeededIds: readonly string[] | undefined | null,
): FailedSection[] {
  const 성공 = new Set((succeededIds ?? []).map((id) => String(id)));
  const 남은것 = new Map<string, FailedSection>();

  for (const section of [...(previous ?? []), ...(incoming ?? [])]) {
    if (!section || typeof section !== "object") continue;
    const id = String(section.section_id ?? "").trim();
    if (!id || 성공.has(id)) continue;
    // 뒤에 온 것이 이긴다.
    남은것.set(id, section);
  }

  return [...남은것.values()];
}
