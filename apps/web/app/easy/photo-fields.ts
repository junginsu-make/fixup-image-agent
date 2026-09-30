import { isPersonRole, type EasyPhotoRole, type RoleJudgment } from "./photo-roles";

/**
 * 정해진 역할을 **이미지 만들기가 이미 받는 칸**으로 옮긴다(설계 §2-6).
 *
 * 이미지 만들기는 역할 넷 · 역할마다의 문구 · 차례를 이미 안다. 「쉽게」는 칸만
 * 채우고 그 라우트를 그대로 부른다 — 이미지 만들기 코드는 0줄이다.
 */

export interface EasyPosterFields {
  referenceIds: string[];
  preservedIds: string[];
  personIds: string[];
  restyledIds: string[];
  attachmentOrder: string[];
}

/**
 * 역할 → 칸. **`restyledIds ⊆ personIds ⊆ preservedIds`** 를 지킨다.
 *
 * 까닭은 주소와 셈이다. 이미지 만들기는 올릴 그림을 `referenceIds`·`preservedIds`
 * 에서만 찾는다 — `personIds` 에만 있으면 첨부가 통째로 빠지고, 차례에 넣으면
 * 차례 검사가 거절한다. 장수 셈과 옛 경로도 두 목록만 센다.
 *
 * 차례는 **붙인 순서 그대로**다. 전에는 「따라 만들기 먼저」로 다시 짰다.
 */
export function posterFieldsFrom(rows: ReadonlyArray<{ id: string; role: EasyPhotoRole }>): EasyPosterFields {
  const idsWhere = (test: (role: EasyPhotoRole) => boolean) =>
    rows.filter((row) => test(row.role)).map((row) => row.id);

  return {
    referenceIds: idsWhere((role) => role === "style"),
    preservedIds: idsWhere((role) => role !== "style"),
    personIds: idsWhere(isPersonRole),
    restyledIds: idsWhere((role) => role === "preserve_person_restyled"),
    attachmentOrder: rows.map((row) => row.id),
  };
}

/**
 * 그림 모델에 **사용자 말을 보낼까**(설계 §2-6).
 *
 * 이 말이 있으면 이미지 만들기는 「사용자 말이 부딪히는 규칙을 이긴다」를 붙인다.
 * 말과 최종 역할이 어긋난 채 보내면 **말이 이긴다** — 물음에서 1번을 「분위기만」
 * 으로 바꿔도 처음 쓴 「1번 제품은 그대로」가 이긴다.
 *
 * 셋 다 맞아야 보낸다. 보낼 때는 **말 전체**를 보낸다 — 떼어 오면 「바꿔 그리지
 * 마」가 「바꿔」로 잘릴 수 있다(설계 §2-4).
 *
 * 1. 말이 사진의 쓰임을 말했다(`said` 가 하나 이상)
 * 2. 고른 것이 말을 뒤집지 않았다(`said` 인 사진의 최종 역할 = 말의 역할)
 * 3. 말 안에서 같은 사진의 쓰임이 엇갈리지 않았다
 */
export function easyAttachmentIntent(input: {
  words: string;
  judged: RoleJudgment;
  final: readonly EasyPhotoRole[];
}): string {
  if (input.judged.conflicting) return "";
  const 말한것 = input.judged.photos
    .map((photo, index) => ({ photo, index }))
    .filter(({ photo }) => photo.said);
  if (!말한것.length) return "";
  const 뒤집힘 = 말한것.some(({ photo, index }) => input.final[index] !== photo.role);
  return 뒤집힘 ? "" : input.words.trim();
}
