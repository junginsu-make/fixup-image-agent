import type { Attachment, StyleRole } from "@fixup/sns-core";
import type { CardPhotoRole } from "./photo-roles";

/**
 * 정해진 역할을 **카드뉴스가 받는 첨부**로 옮긴다(2단계 설계 §5).
 *
 * 카드는 **자기 자리 레퍼런스만** 본다(`sns-core/image-prompt.ts` 의
 * `selectReferencesForRole`). 자리를 비우면 그 카드는 다른 모양으로 나온다. 그래서
 * 레퍼런스가 한 장이면 세 자리 모두에 넣는다. 같은 그림을 자리만 달리해 여러 번
 * 넣어도 올리기는 한 번이다(`queued-flow.ts` 의 `uploadUniqueReferences`).
 */

export interface CardPhoto {
  id: string;
  /** 저장 경로. 첫 칸이 소유자다(`docs/DEPLOY.md`). */
  storagePath: string;
  url?: string | null;
}

export const NO_REFERENCE = "따라 만들 카드뉴스를 붙여 주세요. 그 디자인을 따라 만듭니다.";
export const NOT_MINE = "카드뉴스는 내가 올린 그림만 쓸 수 있습니다. 그 그림을 빼고 다시 보내 주세요.";

const 자리들 = new Set<string>(["cover", "body", "ending"]);

/** 붙인 순서로 자리를 나눈다. 정해 준 자리가 하나라도 있으면 그것을 쓰고 나머지는 속지. */
export function styleSlots(
  ids: readonly string[],
  explicit: Readonly<Record<string, StyleRole>> = {},
): Array<{ id: string; role: StyleRole }> {
  if (ids.some((id) => explicit[id])) return ids.map((id) => ({ id, role: explicit[id] ?? "body" }));
  if (ids.length === 1) return (["cover", "body", "ending"] as const).map((role) => ({ id: ids[0]!, role }));
  if (ids.length === 2) {
    return [{ id: ids[0]!, role: "cover" }, { id: ids[1]!, role: "body" }, { id: ids[1]!, role: "ending" }];
  }
  return ids.map((id, index) => ({
    id,
    role: index === 0 ? "cover" : index === ids.length - 1 ? "ending" : "body",
  }));
}

/** 「2번이 표지」 · 「3번은 마지막 장」을 읽는다. 번호는 붙인 순서다. */
export function slotsFromWords(words: string, ids: readonly string[]): Record<string, StyleRole> {
  const found: Record<string, StyleRole> = {};
  for (const match of words.matchAll(/(\d+)\s*번\S*\s*(표지|속지|끝|엔딩|마지막)/g)) {
    const id = ids[Number(match[1]) - 1];
    if (!id) continue;
    found[id] = match[2] === "표지" ? "cover" : match[2] === "속지" ? "body" : "ending";
  }
  return found;
}

/** 화면이 보낸 자리(저장한 세트에서 옴). 목록 밖 id · 모르는 자리는 버린다. */
export function readChosenSlots(raw: unknown, ids: readonly string[]): Record<string, StyleRole> {
  if (!Array.isArray(raw)) return {};
  const allowed = new Set(ids);
  return Object.fromEntries(
    raw
      .map((entry) => entry as { id?: unknown; role?: unknown } | null)
      .filter((one): one is { id: string; role: StyleRole } =>
        one !== null && typeof one.id === "string" && typeof one.role === "string"
        && allowed.has(one.id) && 자리들.has(one.role))
      .map((one) => [one.id, one.role]),
  );
}

type 결과 = { ok: true; attachments: Attachment[] } | { ok: false; reason: "no_reference" | "not_mine" | "no_url" };

export function cardAttachmentsFrom(input: {
  userId: string;
  photos: readonly CardPhoto[];
  rows: ReadonlyArray<{ id: string; role: CardPhotoRole }>;
  slots?: Readonly<Record<string, StyleRole>>;
}): 결과 {
  const byId = new Map(input.photos.map((photo) => [photo.id, photo]));
  // 카드뉴스는 내 폴더 것만 받는다(`project-service.ts:66-69`). 빠져나가는 경로도 막는다.
  const 내것 = (path: string) => path.startsWith(`${input.userId}/`) && !path.includes("..") && !path.includes("\\");

  for (const row of input.rows) {
    const photo = byId.get(row.id);
    if (!photo || !내것(photo.storagePath)) return { ok: false, reason: "not_mine" };
    if (!photo.url) return { ok: false, reason: "no_url" };
  }
  const 분위기 = input.rows.filter((row) => row.role === "style").map((row) => row.id);
  if (!분위기.length) return { ok: false, reason: "no_reference" };

  const 바탕 = (id: string) => ({ assetPath: byId.get(id)!.storagePath, url: byId.get(id)!.url! });
  const 자리 = styleSlots(분위기, input.slots);
  const attachments = input.rows.flatMap((row): Attachment[] => {
    if (row.role === "style") {
      return 자리.filter((one) => one.id === row.id)
        .map((one) => ({ id: row.id, kind: "style_reference", role: one.role, ...바탕(row.id) }));
    }
    if (row.role === "preserve_product") return [{ id: row.id, kind: "keep_identity", subject: "object", ...바탕(row.id) }];
    if (row.role === "preserve_person") return [{ id: row.id, kind: "keep_identity", subject: "person", ...바탕(row.id) }];
    if (row.role === "preserve_person_restyled") {
      return [{ id: row.id, kind: "keep_identity", subject: "person", restyle: true, ...바탕(row.id) }];
    }
    if (row.role === "place_as_is") return [{ id: row.id, kind: "place_as_is", ...바탕(row.id) }];
    return [{ id: row.id, kind: "ending", ...바탕(row.id) }];
  });
  return { ok: true, attachments };
}
