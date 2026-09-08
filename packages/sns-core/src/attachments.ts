/**
 * 첨부 이미지 네 종류.
 *
 * 2026-07-30 상세페이지 참조 정책을 카드뉴스에 옮긴 것이다.
 * 그대로 지키는 것(identity)과 비슷하게 따라가는 것(design language)을 가른다.
 */
export type AttachmentKind =
  | "keep_identity"    // 그대로 넣을 것 — 제품·인물·로고. 각도는 바뀌어도 정체성 유지
  | "place_as_is"      // 원본 그대로 쓸 장 — 표·포스터. AI 를 안 거치고 여백을 둬 배치
  | "style_reference"  // 따라 만들 카드뉴스 — 그대로 주고 내용만 갈아 끼움
  | "ending";          // 마지막 장

export type StyleRole = "cover" | "body" | "ending";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  assetPath: string;
  url: string;
  /** style_reference 만 갖는다. */
  role?: StyleRole;
  /** keep_identity 가 사람인지 물건인지. 사람은 하나만 허용한다. */
  subject?: "person" | "object";
  /**
   * 사람은 그대로 두되 **그림 느낌만** 바꿔도 되나 (설계 §4-3).
   *
   * `keep_identity` + `subject: "person"` 일 때만 뜻이 있다. 없으면 지금까지처럼
   * 그림 느낌까지 고정한다 — 옛 작업에는 이 값이 없다.
   */
  restyle?: boolean;
  /** place_as_is 를 넣을 속지 번호. 사람이 정하며, 비우면 입력 순서를 쓴다. */
  bodySlot?: number;
}

export interface GroupedAttachments {
  keepIdentity: Attachment[];
  placeAsIs: Attachment[];
  styleReferences: Attachment[];
  styleByRole: Record<StyleRole, Attachment[]>;
  ending?: Attachment;
}

export function groupAttachments(list: Attachment[]): GroupedAttachments {
  const styleReferences = list.filter((item) => item.kind === "style_reference");
  return {
    keepIdentity: list.filter((item) => item.kind === "keep_identity"),
    placeAsIs: list.filter((item) => item.kind === "place_as_is"),
    styleReferences,
    styleByRole: {
      cover: styleReferences.filter((item) => item.role === "cover"),
      body: styleReferences.filter((item) => item.role === "body"),
      ending: styleReferences.filter((item) => item.role === "ending"),
    },
    ending: list.find((item) => item.kind === "ending"),
  };
}

export interface PlaceAsIsPlacement {
  id: string;
  bodySlot?: number;
}

/** 표지와 마지막 장을 뺀 실제 속지 자리 수. */
export function placeAsIsCapacity(totalCards: number): number {
  return Math.max(0, totalCards - 2);
}

export function validatePlaceAsIsCapacity(count: number, totalCards: number): string[] {
  const capacity = placeAsIsCapacity(totalCards);
  return count > capacity
    ? [`원본 그대로 쓸 장은 ${count}장이지만 속지 자리는 ${capacity}자리뿐입니다.`]
    : [];
}

export function validatePlaceAsIsSlots(
  items: PlaceAsIsPlacement[],
  totalCards: number,
): string[] {
  const issues = validatePlaceAsIsCapacity(items.length, totalCards);
  const lastBodySlot = totalCards - 1;
  const specifiedSlots = items.flatMap((item) =>
    item.bodySlot === undefined ? [] : [item.bodySlot],
  );

  for (const slot of specifiedSlots) {
    if (!Number.isInteger(slot) || slot < 2 || slot > lastBodySlot) {
      issues.push(`원본 그대로 쓸 장의 속지 자리는 2~${lastBodySlot}번이어야 합니다.`);
      break;
    }
  }

  const seen = new Set<number>();
  for (const slot of specifiedSlots) {
    if (seen.has(slot)) {
      issues.push(`원본 그대로 쓸 장의 ${slot}번 자리가 겹칩니다.`);
      break;
    }
    seen.add(slot);
  }
  return issues;
}

/** 만들기 전에 막는다. 생성 뒤에 알면 돈만 나간다. */
export function validateAttachments(list: Attachment[], max: number, totalCards?: number): string[] {
  const issues: string[] = [];
  const grouped = groupAttachments(list);

  if (list.length > max) issues.push(`첨부 이미지는 ${max}장까지 올릴 수 있습니다.`);
  if (grouped.styleReferences.length === 0) {
    issues.push("따라 만들 카드뉴스를 한 장 이상 올려 주세요. 이걸 기준으로 만듭니다.");
  }
  if (grouped.styleByRole.cover.length > 1) issues.push("표지로 지정한 그림은 한 장이어야 합니다.");
  if (grouped.styleByRole.ending.length > 1) issues.push("엔딩으로 지정한 그림은 한 장이어야 합니다.");
  if (list.filter((item) => item.kind === "ending").length > 1) {
    issues.push("마지막 장 이미지는 한 장만 넣을 수 있습니다.");
  }
  if (grouped.keepIdentity.filter((item) => item.subject === "person").length > 1) {
    issues.push("그대로 넣을 인물은 한 명만 지정해 주세요. 둘이면 얼굴이 섞입니다.");
  }
  if (totalCards !== undefined) {
    issues.push(...validatePlaceAsIsSlots(grouped.placeAsIs, totalCards));
  }
  return issues;
}
