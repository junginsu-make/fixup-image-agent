import {
  DEFAULT_FONT_FAMILY,
  type LayoutSlot,
  type SlotBox,
  type SlotKind,
  type TextStyle,
} from "@fixup/layout-core";

/**
 * 칸을 만들고 종류를 바꾼다.
 *
 * 종류를 바꿔도 **자리는 그대로 둔다.** 사람이 애써 맞춰 놓은 위치가
 * 드롭다운 한 번에 사라지면 안 된다.
 */

export const SLOT_LABEL: Record<SlotKind, string> = {
  background: "배경",
  image: "그림",
  logo: "로고",
  text: "글",
};

export const TEXT_FIELD_LABEL = {
  headline: "제목",
  body: "본문",
  accent: "강조",
  footnote: "작은 글씨",
} as const;

export const DEFAULT_TEXT_STYLE: TextStyle = {
  family: DEFAULT_FONT_FAMILY,
  weight: 700,
  sizeRatio: 0.4,
  lineHeight: 1.3,
  color: "#111111",
  align: "left",
  valign: "top",
};

/** 새 칸은 가운데에 적당한 크기로 놓는다. 사람이 옮기면 된다. */
export function newSlot(kind: SlotKind, box: SlotBox = { x: 0.2, y: 0.4, width: 0.6, height: 0.2 }): LayoutSlot {
  return convertSlot({ kind: "image", box }, kind);
}

export function convertSlot(slot: LayoutSlot, kind: SlotKind): LayoutSlot {
  if (slot.kind === kind) return slot;
  const box = slot.box;
  switch (kind) {
    case "background":
      return { kind: "background", box, fill: "#FFFFFF" };
    case "image":
      return { kind: "image", box };
    case "logo":
      return { kind: "logo", box, referenceImageId: "", fit: "contain" };
    case "text":
      return {
        kind: "text",
        box,
        source: { from: "copy", field: "headline" },
        style: slot.kind === "text" ? slot.style : DEFAULT_TEXT_STYLE,
      };
  }
}

export function replaceSlot(slots: LayoutSlot[], offset: number, next: LayoutSlot): LayoutSlot[] {
  return slots.map((slot, index) => (index === offset ? next : slot));
}

export function removeSlot(slots: LayoutSlot[], offset: number): LayoutSlot[] {
  return slots.filter((_slot, index) => index !== offset);
}

/** 배열 뒤쪽이 위에 그려진다. 「위로」는 뒤로 보내는 것이다. */
export function moveSlot(slots: LayoutSlot[], offset: number, direction: -1 | 1): LayoutSlot[] {
  const target = offset + direction;
  if (target < 0 || target >= slots.length) return slots;
  const next = [...slots];
  const moved = next[offset]!;
  next[offset] = next[target]!;
  next[target] = moved;
  return next;
}

/** 화면에서 소수점을 그대로 두면 0.30000000000000004 가 보인다. */
export function roundBox(box: SlotBox): SlotBox {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) };
}
