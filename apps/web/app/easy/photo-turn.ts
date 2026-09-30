import { photoLimit } from "./photo-check";
import {
  easyRolePrompt, mergeRoles, photoAskReason, readRoleJudgment,
  type EasyPhoto, type EasyPhotoRole, type PhotoRow,
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
  chosen: Readonly<Record<string, EasyPhotoRole>>;
  ratio: string;
  imageModel?: string;
}

export interface PhotoTurnDeps {
  /** id → 설명. 못 읽은 사진은 없다. */
  read(photos: readonly EasyPhoto[]): Promise<Record<string, string>>;
  /** ⓑ2 를 부른다. */
  judge(prompt: string): Promise<unknown>;
}

export type PhotoTurn =
  | { kind: "stop"; message: string }
  | { kind: "ask"; reason: "unclear" | "people"; rows: PhotoRow[] }
  | {
    kind: "go";
    rows: Array<{ id: string; role: EasyPhotoRole }>;
    fields: EasyPosterFields;
    attachmentIntent: string;
  };

export async function runPhotoTurn(input: PhotoTurnInput, deps: PhotoTurnDeps): Promise<PhotoTurn> {
  // ⓒ 읽기 전에 본다 — 못 만들 요청이면 읽기값도 안 낸다.
  const limit = photoLimit({ ratio: input.ratio, imageModel: input.imageModel, count: input.photos.length });
  if (!limit.ok) return { kind: "stop", message: limit.message };

  // ⓐ 단추로 고른 사진은 읽지 않는다. 역할을 정할 일이 없는데 읽으면 값과 기다림만 는다.
  const toRead = input.photos.filter((photo) => !input.chosen[photo.id]);
  const descriptions = toRead.length ? await deps.read(toRead) : {};

  // ⓑ2 다 골랐어도 돈다 — 말과 고른 것이 부딪히는지 알아야 한다(설계 §2-5).
  const read = readRoleJudgment(
    await deps.judge(easyRolePrompt({
      words: input.words,
      photos: input.photos.map((photo) => ({ description: descriptions[photo.id] })),
    })),
    input.photos.length,
  );

  /*
   * **설명 없는 사진은 말이 쓰임을 말했을 때만 역할을 갖는다**(설계 §2-3).
   *
   * 프롬프트도 그렇게 시키지만 그 한 문장에만 기대지 않는다(2026-09-30 독립
   * 리뷰). 모델이 여기에 `style` 을 주면 지켜야 할 제품이 다시 그려진다 —
   * 가장 비싼 실수다. 단추로 고른 사진은 판단을 안 쓰므로 건드리지 않는다.
   */
  const judged = {
    ...read,
    photos: read.photos.map((judgment, index) => {
      const photo = input.photos[index]!;
      const 설명없음 = !input.chosen[photo.id] && !descriptions[photo.id];
      return 설명없음 && !judgment.said ? { role: "unclear" as const, said: false } : judgment;
    }),
  };

  // ⓓ 고른 것 > 말·판단 > 모름.
  const rows = mergeRoles({ ids: input.photos.map((photo) => photo.id), chosen: input.chosen, judged });
  const reason = photoAskReason(rows);
  if (reason) return { kind: "ask", reason, rows };

  const decided = rows.map((row) => ({ id: row.id, role: row.role as EasyPhotoRole }));
  return {
    kind: "go",
    rows: decided,
    fields: posterFieldsFrom(decided),
    attachmentIntent: easyAttachmentIntent({ words: input.words, judged, final: decided.map((row) => row.role) }),
  };
}
