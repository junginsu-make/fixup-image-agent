/**
 * 대화로 모으는 것들 — 무엇이 모자란지는 코드가 안다.
 *
 * 대화는 LLM 이 이끌지만, **언제 충분한가는 코드가 정한다.** LLM 에게 맡기면
 * 절반만 듣고 "이제 만들 수 있습니다" 라고 한다. 반대로 필요한 말까지 코드가
 * 정해 두면 취조가 된다.
 *
 *   코드가 정한다   무엇이 있어야 만들 수 있는가
 *   LLM 이 정한다   그것을 어떤 말로 물을 것인가
 *
 * 그래서 모자란 칸에는 이름과 **왜 필요한지**를 함께 달아 둔다. LLM 은 그
 * 이유를 읽고 사람이 하는 말로 바꾼다.
 */

export type StudioTool = "sns" | "poster";

export interface Intake {
  tool?: StudioTool;
  /** 무엇을 알리는 것인가. 한 줄. */
  topic?: string;
  /** 내용을 어디서 가져오나. none 은 "설명만으로 만들어 주세요". */
  sourceKind?: "text" | "youtube" | "url" | "none";
  /** 유튜브·웹이면 주소, 글이면 붙여넣은 본문. */
  sourceRef?: string;
  audience?: string;
  /** 카드뉴스만 쓴다. */
  cardCount?: number;
  /** 첨부할지 안 할지 답을 들었나. 안 하겠다는 답도 답이다. */
  attachmentsDecided?: boolean;
  attachmentCount?: number;
  /** 인물이 등장해야 하나. */
  needsPerson?: boolean;
  /** 쓸 만한 인물 사진이나 캐릭터를 이미 가졌나. */
  hasPersonImage?: boolean;
}

export interface MissingSlot {
  id: string;
  /** 사용자에게 물을 때 부를 이름. */
  label: string;
  /** 왜 필요한가. LLM 이 이 이유를 읽고 문장을 만든다. */
  why: string;
}

const SLOT = {
  tool: {
    id: "tool",
    label: "무엇을 만들지",
    why: "카드뉴스는 여러 장으로 이야기를 잇고 포스터는 한 장으로 붙잡습니다. 만드는 방법이 달라 이것부터 정해야 합니다.",
  },
  topic: {
    id: "topic",
    label: "주제",
    why: "무엇을 알리는 것인지 한 줄이면 됩니다. 이게 없으면 원고를 쓸 수 없습니다.",
  },
  source: {
    id: "source",
    label: "내용",
    why: "유튜브 주소나 웹 주소를 주면 자막·본문을 가져옵니다. 직접 쓰셔도 되고, 설명만으로 만들 수도 있습니다.",
  },
  cardCount: {
    id: "cardCount",
    label: "장수",
    why: "몇 장으로 만들지 정해야 이야기를 나눌 수 있습니다. 보통 6장을 씁니다.",
  },
  attachments: {
    id: "attachments",
    label: "첨부 이미지",
    why: "따라 만들 디자인이나 그대로 넣을 제품·인물 사진이 있으면 올려 주세요. 없으면 없는 대로 만듭니다.",
  },
  reference: {
    id: "reference",
    label: "따라 만들 포스터",
    why: "포스터는 따라 만들 그림이 한 장은 있어야 합니다. 라이브러리에서 골라도 되고 새로 올려도 됩니다.",
  },
} as const;

export function missingSlots(intake: Intake): MissingSlot[] {
  // 무엇을 만들지 모르면 나머지를 물어도 소용이 없다.
  if (!intake.tool) return [SLOT.tool];

  const missing: MissingSlot[] = [];
  if (!intake.topic?.trim()) missing.push(SLOT.topic);

  // 내용을 어디서 가져올지 정했고, 주소가 필요한 길이면 주소까지 있어야 한다.
  const needsRef = intake.sourceKind === "youtube" || intake.sourceKind === "url" || intake.sourceKind === "text";
  if (!intake.sourceKind || (needsRef && !intake.sourceRef?.trim())) missing.push(SLOT.source);

  if (intake.tool === "sns" && !intake.cardCount) missing.push(SLOT.cardCount);

  if (!intake.attachmentsDecided) missing.push(SLOT.attachments);
  // 포스터는 따라 만들 그림이 없으면 시작 자체가 막힌다(PosterProjectInputSchema).
  else if (intake.tool === "poster" && !intake.attachmentCount) missing.push(SLOT.reference);

  return missing;
}

export function isReady(intake: Intake): boolean {
  return missingSlots(intake).length === 0;
}

export interface StudioSuggestion {
  href: string;
  label: string;
  why: string;
}

/**
 * 인물이 필요한데 쓸 사진이 없으면 캐릭터 도구로 보낸다.
 *
 * 그냥 "인물 사진을 올려 주세요" 라고 하면 없는 사람은 막힌다. 우리에게
 * 만드는 도구가 있으니 그리로 안내한다.
 */
export function characterSuggestion(intake: Intake): StudioSuggestion | null {
  if (!intake.needsPerson || intake.hasPersonImage) return null;
  return {
    href: "/characters",
    label: "캐릭터 만들기",
    why: "쓸 만한 인물 사진이 없으면 캐릭터를 만들어 두면 됩니다. 정면·좌측·우측·뒷모습이 함께 나와서 여러 장에 같은 사람이 나옵니다.",
  };
}
