/**
 * 결과 목록의 **차례와 이름.**
 *
 * 2026-09-29 — 변형 3을 「이 장만 고치기」로 고쳤는데 결과가 목록 앞쪽에
 * 「변형 1」로 붙었다. `variantIndex` 는 요청 안의 배열 번호라 요청마다 0 부터
 * 세고(고치기는 한 장이라 늘 0), 목록은 그 번호로만 줄 세웠다. 사용자는 변형 3
 * 자리만 보고 「안 먹혔다」고 읽었다.
 *
 * 그래서 **만든 차례**로 줄 세우고, 고친 결과에는 **무엇을 무슨 말로 고쳤는지**를
 * 붙인다. 그 이력은 이미 요청 장부에 있다(`parent_image_id`·`edit_instruction`,
 * 설계 2026-08-31 §「부모와 계보를 저장한다」) — 표를 바꿀 일이 없다.
 *
 * 로컬과 운영이 같은 규칙을 타도록 여기 둔다.
 */

/** 「이 장만 고치기」로 나온 그림이면 무엇을 무슨 말로 고쳤는지. */
export interface PosterImageEdit {
  /** 고친 그림. 그 그림이 지워졌으면 `null` 이다(FK `on delete set null`). */
  parentImageId: string | null;
  instruction: string;
}

/** 요청 장부 한 줄에서 필요한 것만. */
export interface PosterEditRequest {
  id: string;
  parentImageId: string | null;
  editInstruction: string | null;
}

/**
 * 만든 차례 → 같은 회차 안에서는 변형 번호 차례.
 *
 * **시각을 글자로 견주지 않는다.** Postgres 는 끝자리 0 을 떼고 주므로(초에서 딱
 * 떨어지면 소수점도 없다) `localeCompare` 로 견주면 거꾸로 서는 짝이 생긴다.
 * 같은 회차는 한 번에 넣어 같은 시각이라 번호가 가른다.
 */
export function orderPosterImages<T extends { createdAt: string; variantIndex: number }>(
  images: readonly T[],
): T[] {
  const at = (value: string) => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  };
  return [...images].sort((a, b) => (at(a.createdAt) - at(b.createdAt)) || (a.variantIndex - b.variantIndex));
}

/**
 * 고치기 요청에서 나온 그림에 이력을 붙인다. 나머지는 `edit: null` 이다.
 *
 * 지시가 비어 있는 요청은 고치기가 아니다 — 처음 만들기·다시 만들기다.
 */
export function withEditLineage<T extends { generationRequestId: string }>(
  images: readonly T[],
  requests: readonly PosterEditRequest[],
): Array<T & { edit: PosterImageEdit | null }> {
  const edits = new Map(requests
    .filter((request) => request.editInstruction?.trim())
    .map((request) => [request.id, {
      parentImageId: request.parentImageId,
      instruction: request.editInstruction!.trim(),
    }] as const));
  return images.map((image) => ({ ...image, edit: edits.get(image.generationRequestId) ?? null }));
}

export interface PosterImageLabel {
  /** 「변형 3」 또는 「고친 결과 1」. */
  title: string;
  /** 고친 결과만 — 「변형 3에서 고침 · 「배경을 밤으로」」. */
  detail: string | null;
}

/**
 * 목록에 붙일 이름. **받은 차례대로** 고친 결과에 번호를 매긴다.
 *
 * 처음 만든 것은 지금처럼 「변형 N」이다. 이력이 없으면(팀원이 보는 작업은 요청
 * 장부를 못 읽는다) 고친 결과를 고친 것으로 알 수 없어 **한 회차로 센다** —
 * 「2회차 변형 1」로 불린다. 같은 그림을 주인은 「고친 결과 1」로 보지만, 이름이
 * 겹치지는 않는다.
 *
 * 「을/를」은 숫자 읽기에 따라 갈려서 「에서」를 쓴다.
 *
 * **다시 만들기를 두 번 이상 했으면 회차를 붙인다**(「2회차 변형 1」). `variantIndex`
 * 는 회차마다 0 부터 세서, 안 붙이면 「변형 1」이 둘이 되고 「변형 1에서 고침」이
 * 어느 것인지 모른다(2026-09-29 리뷰). 한 번만 만든 작업은 지금 이름 그대로다.
 * 회차는 **요청 id** 로 가른다 — `generationRequestId` 를 필수로 받아 부르는 쪽이
 * 빠뜨리면 컴파일이 막는다.
 */
export function posterImageLabels(
  images: ReadonlyArray<{
    id: string; variantIndex: number; generationRequestId: string; edit?: PosterImageEdit | null;
  }>,
): Record<string, PosterImageLabel> {
  // 받은 차례대로 회차 번호를 매긴다. 고치기는 회차가 아니다.
  const rounds = [...new Set(images.filter((image) => !image.edit).map((image) => image.generationRequestId))];
  const roundPrefix = (requestId: string) => (rounds.length > 1 ? `${rounds.indexOf(requestId) + 1}회차 ` : "");
  let edited = 0;
  const titles: Record<string, string> = {};
  for (const image of images) {
    titles[image.id] = image.edit
      ? `고친 결과 ${++edited}`
      : `${roundPrefix(image.generationRequestId)}변형 ${image.variantIndex + 1}`;
  }
  return Object.fromEntries(images.map((image): [string, PosterImageLabel] => {
    if (!image.edit) return [image.id, { title: titles[image.id]!, detail: null }];
    const quoted = `「${image.edit.instruction}」`;
    const parent = image.edit.parentImageId ? titles[image.edit.parentImageId] : undefined;
    return [image.id, {
      title: titles[image.id]!,
      detail: parent ? `${parent}에서 고침 · ${quoted}` : quoted,
    }];
  }));
}

/**
 * 그림 한 장을 찾는다 — **그림 id 가 먼저다.**
 *
 * 옛 주소·옛 화면은 변형 번호를 보낸다. 번호는 회차마다 0 부터라 겹치므로 그때는
 * **그 번호 중 가장 최근 것**을 준다 — 화면이 비는 것보다 낫고, 옛 미리보기가
 * 보여 주던 것과 같다.
 *
 * 파일 길(`images/[index]/file`)과 광고 내보내기가 **이 함수 하나**를 쓴다. 전에는
 * 둘이 따로 골랐다 — 파일 길은 「가장 최근」, 광고는 「목록 첫 것」이라 광고
 * 미리보기는 고친 그림, ZIP 은 원본이었다(2026-09-29). 시각은 글자가 아니라
 * 시각으로 견준다(`orderPosterImages`).
 */
export function findPosterImage<T extends { id: string; variantIndex: number; createdAt: string }>(
  images: readonly T[],
  key: string,
): T | null {
  const byId = images.find((image) => image.id === key);
  if (byId) return byId;
  if (!/^\d+$/.test(key)) return null;
  const sameNumber = images.filter((image) => image.variantIndex === Number(key));
  return orderPosterImages(sameNumber).at(-1) ?? null;
}
