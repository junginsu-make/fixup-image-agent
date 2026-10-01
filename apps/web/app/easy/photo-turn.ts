import { photoLimit } from "./photo-check";
import {
  easyRolePrompt, mergeRoles, photoAskReason, readRoleJudgment,
  type CardPhotoRole, type EasyPhoto, type EasyPhotoRead, type EasyPhotoRole, type PhotoRow,
} from "./photo-roles";
import { easyAttachmentIntent, posterFieldsFrom, type EasyPosterFields } from "./photo-fields";

/**
 * **사진이 붙은 그림 턴**(설계 §2-3): ⓒ 장수 → ⓐ 읽기 → ⓑ2 역할 → ⓓ 합치기.
 *
 * 읽기와 판단은 밖에서 받는다. 그래야 모델을 안 부르고 차례를 값으로 잰다 —
 * 무엇을 먼저 하고 무엇을 건너뛰는지가 이 파일의 전부다.
 */

export interface PhotoTurnInput {
  /** ⓪에서 확인을 마친 사진. 붙인 순서다. */
  photos: readonly EasyPhoto[];
  /** 이번 요청의 말 전체(처음 말 + 말로 한 답). */
  words: string;
  /** 서버가 다시 확인한 고른 역할. */
  chosen: Readonly<Record<string, CardPhotoRole>>;
  /** 서버가 다시 확인한 지난 역할(설계 §2-4 차례 3). 없으면 빈 것으로 본다. */
  previous?: Readonly<Record<string, CardPhotoRole>>;
  /** 카드뉴스 턴이면 두 역할(원본 그대로 · 마지막 장)을 더 안다(2단계 §5-1). */
  mode?: "image" | "cardnews";
  ratio: string;
  imageModel?: string;
}

export interface PhotoTurnDeps {
  /** id → 읽은 것. 못 읽은 사진은 없다. */
  read(photos: readonly EasyPhoto[]): Promise<Record<string, EasyPhotoRead>>;
  /** ⓑ2 를 부른다. */
  judge(prompt: string): Promise<unknown>;
}

export type PhotoTurn =
  | { kind: "stop"; message: string }
  | { kind: "ask"; reason: "unclear" | "people"; rows: PhotoRow[] }
  | {
    kind: "go";
    rows: Array<{ id: string; role: CardPhotoRole }>;
    /** 이미지 한 장일 때만. 카드뉴스는 `cardnews-attachments.ts` 가 옮긴다. */
    fields?: EasyPosterFields;
    attachmentIntent: string;
  };

export async function runPhotoTurn(input: PhotoTurnInput, deps: PhotoTurnDeps): Promise<PhotoTurn> {
  // ⓒ 읽기 전에 본다 — 못 만들 요청이면 읽기값도 안 낸다.
  const limit = photoLimit({ ratio: input.ratio, imageModel: input.imageModel, count: input.photos.length });
  if (!limit.ok) return { kind: "stop", message: limit.message };

  // ⓐ 단추로 고른 사진은 읽지 않는다. 역할을 정할 일이 없는데 읽으면 값과 기다림만 는다.
  //   **지난 역할이 있는 사진은 읽는다**(2026-09-30 두 번째 독립 리뷰). 안 읽으면
  //   사진이 둘 이상일 때 「제품 그대로 크게」가 어느 사진인지 판단이 못 가린다.
  const toRead = input.photos.filter((photo) => !input.chosen[photo.id]);
  const reads: Record<string, EasyPhotoRead> = toRead.length ? await deps.read(toRead) : {};

  // ⓑ2 다 골랐어도 돈다 — 말과 고른 것이 부딪히는지 알아야 한다(설계 §2-5).
  const read = readRoleJudgment(
    await deps.judge(easyRolePrompt({
      words: input.words,
      photos: input.photos.map((photo) => ({ description: reads[photo.id]?.description })),
      // 이어 만드는 턴인지만 알린다. 지난 역할 자체는 안 준다 — 주면 말이 무엇을
      // 말했는지(`said`)를 그것과 떼어 알 수 없다(설계 §2-4).
      followUp: Object.keys(input.previous ?? {}).length > 0,
      cardnews: input.mode === "cardnews",
    })),
    input.photos.length,
    { cardnews: input.mode === "cardnews" },
  );

  /*
   * **말이 쓰임을 말하지 않았으면 코드가 묻게 하는 두 경우**(설계 §2-3 · §2-4 표).
   *
   * - 설명이 없는 사진 — 무엇인지 모르고 골랐다(2026-09-30 독립 리뷰)
   * - 사람이 있고 글자 디자인이 없는 사진 · 그림 — 사람을 살릴지 느낌만 볼지 두
   *   갈래다. 사용자 사진으로 재 보니 가족 일러스트가 세 번 중 두 번 분위기로
   *   갔다(읽기 설명이 매번 달라 모델이 흔들린다). 글자가 있는 포스터는 디자인
   *   참고물이라 여기 안 걸린다
   *
   * 프롬프트도 그렇게 시키지만 그 문장에만 기대지 않는다. 모델이 여기에 `style` 을
   * 주면 지켜야 할 것이 다시 그려진다 — 가장 비싼 실수다. 단추로 고른 사진은
   * 판단을 안 쓰므로 건드리지 않는다.
   */
  const judged = {
    ...read,
    photos: read.photos.map((judgment, index) => {
      const photo = input.photos[index]!;
      const one = reads[photo.id];
      const 모호함 = !one || (one.hasPeople && !one.hasText);
      return !input.chosen[photo.id] && 모호함 && !judgment.said
        ? { role: "unclear" as const, said: false }
        : judgment;
    }),
  };

  // ⓓ 고른 것 > 말 > 지난 역할 > 판단 > 모름.
  const rows = mergeRoles({
    ids: input.photos.map((photo) => photo.id),
    chosen: input.chosen,
    previous: input.previous,
    judged,
  });
  const reason = photoAskReason(rows);
  if (reason) return { kind: "ask", reason, rows };

  const decided = rows.map((row) => ({ id: row.id, role: row.role as CardPhotoRole }));
  return {
    kind: "go",
    rows: decided,
    fields: input.mode === "cardnews"
      ? undefined
      : posterFieldsFrom(decided as Array<{ id: string; role: EasyPhotoRole }>),
    attachmentIntent: easyAttachmentIntent({ words: input.words, judged, final: decided.map((row) => row.role) }),
  };
}
