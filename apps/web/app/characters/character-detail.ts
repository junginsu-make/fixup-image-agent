/**
 * 캐릭터 한 장을 **무엇으로 만들었는지** 보여줄 때 쓰는 규칙들.
 *
 * 카드뉴스·포스터의 「과정 보기」와 같은 자리다. 다만 캐릭터는 단계를 밟아
 * 만드는 흐름이 아니라 **설정과 결과물**이라, 보여줄 것이 다르다 —
 * 내가 적은 묘사, AI 가 정리한 정체성, 종류와 화풍, 각도별 그림.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 규칙이라 시험에서 값으로 잰다 —
 * 이 저장소에는 jsdom 이 없어 컴포넌트를 렌더해서 잴 수 없다.
 */

/** 화면에 한 줄로 거는 값. 비어 있으면 아예 안 낸다. */
export interface DetailRow {
  label: string;
  value: string;
}

const KIND_LABEL: Record<string, string> = {
  person: "인물",
  animal: "동물",
  object: "사물",
  character: "캐릭터",
};

const LOOK_LABEL: Record<string, string> = {
  photoreal: "실사",
  illustration: "그림",
};

/**
 * 「어떻게 만들었습니다」에 적을 줄들.
 *
 * **빈 값은 줄을 만들지 않는다.** 「종류: 」처럼 값 없는 줄이 서면 화면이
 * 고장난 것처럼 보인다 — 라이브러리 작업물 카드가 같은 판단을 하고 있다
 * (`works-tab.tsx` 의 `settings.filter`).
 *
 * 모르는 종류·화풍은 **저장된 값을 그대로** 낸다. 표에 없다고 숨기면 그 값이
 * 있다는 사실까지 사라진다.
 */
export function characterDetailRows(character: {
  sourcePrompt?: string | null;
  identityPrompt?: string | null;
  kind?: string | null;
  look?: string | null;
  createdAt?: string | null;
}): DetailRow[] {
  const rows: Array<DetailRow | null> = [
    character.sourcePrompt
      ? { label: "이렇게 말했습니다", value: character.sourcePrompt } : null,
    character.identityPrompt
      ? { label: "AI 가 정리한 정체성", value: character.identityPrompt } : null,
    character.kind
      ? { label: "종류", value: KIND_LABEL[character.kind] ?? character.kind } : null,
    character.look
      ? { label: "화풍", value: LOOK_LABEL[character.look] ?? character.look } : null,
  ];
  return rows.filter(Boolean) as DetailRow[];
}

/**
 * 화면에 걸 각도.
 *
 * **그림이 없는 각도는 뺀다.** 만들다 만 캐릭터에는 빈 자리가 남는데, 그것을
 * 그리면 「그림이 사라졌다」로 읽힌다(2026-09-16 포스터에서 실제로 그렇게
 * 읽혔다).
 */
export function shownViews<T extends { url?: string | null; thumbUrl?: string | null }>(
  views: readonly T[] | null | undefined,
): T[] {
  return (views ?? []).filter((view) => Boolean(view.url || view.thumbUrl));
}
