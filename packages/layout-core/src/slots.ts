/**
 * 칸 — 카드 한 장을 이루는 최소 단위.
 *
 * 좌표를 픽셀로 두면 4:5 로 만든 뼈대를 9:16 에 못 쓴다. **0~1 사이 비율**로
 * 둬서 카드 크기가 바뀌어도 같은 뼈대가 그대로 쓰이게 한다.
 */

export interface SlotBox {
  /** 0~1, 왼쪽에서 */
  x: number;
  /** 0~1, 위에서 */
  y: number;
  /** 0~1 */
  width: number;
  /** 0~1 */
  height: number;
}

/** 카피 파이프라인(`CardCopy`)이 이미 채워 둔 칸 이름. */
export type TextField = "headline" | "body" | "accent" | "footnote";

export type TextSource =
  | { from: "copy"; field: TextField }
  /** 「자세히 보기」 같은 고정 문구. */
  | { from: "fixed"; text: string };

/**
 * 글꼴 이름에 쓸 수 있는 글자.
 *
 * 이름이 그대로 파일 경로가 된다. 막지 않으면 `../../..` 로 폰트 폴더 밖을
 * 두드려 「그 파일이 있는가」를 알아낼 수 있다(읽지는 못한다).
 */
export const FONT_FAMILY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;

export interface TextStyle {
  /** 동봉한 폰트 이름. `FONT_FAMILY_PATTERN` 을 지켜야 한다. */
  family: string;
  weight: 400 | 700;
  /** 칸 높이 대비 비율. 픽셀로 두면 카드 크기가 바뀔 때 안 맞는다. */
  sizeRatio: number;
  /** 배수. */
  lineHeight: number;
  /** #RRGGBB */
  color: string;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
}

export type SlotKind = "background" | "image" | "logo" | "text";

export type LayoutSlot =
  /** 단색만이다. 그라디언트·무늬가 필요하면 image 칸을 배경 크기로 깐다. */
  | { kind: "background"; box: SlotBox; fill: string }
  /** AI 가 그린다. */
  | { kind: "image"; box: SlotBox; brief?: string }
  /** AI 를 거치지 않는다. 모델이 로고를 다시 그리면 항상 다른 로고가 된다. */
  | { kind: "logo"; box: SlotBox; referenceImageId: string; fit: "contain" }
  | { kind: "text"; box: SlotBox; source: TextSource; style: TextStyle };

export interface CardSize {
  width: number;
  height: number;
}

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * 비율 칸을 픽셀 자리로 옮긴다.
 *
 * 너비를 반올림하고 왼쪽도 따로 반올림하면 붙어 있어야 할 두 칸 사이에 1픽셀
 * 틈이 생기거나 1픽셀 겹친다. **양쪽 끝을 각각 반올림하고 그 차이를 너비로**
 * 삼으면 한 칸의 오른쪽 끝과 다음 칸의 왼쪽 끝이 언제나 같은 값이 된다.
 */
export function slotRect(box: SlotBox, size: CardSize): PixelRect {
  const horizontal = span(box.x, box.x + Math.max(0, box.width), size.width);
  const vertical = span(box.y, box.y + Math.max(0, box.height), size.height);

  return {
    left: horizontal.from,
    top: vertical.from,
    width: horizontal.size,
    height: vertical.size,
  };
}

/** 한 축을 픽셀로 옮긴다. 칸이 통째로 사라지지 않게 최소 1픽셀은 남긴다. */
function span(start: number, end: number, total: number): { from: number; size: number } {
  const from = Math.round(clamp01(start) * total);
  const size = Math.min(total, Math.max(1, Math.round(clamp01(end) * total) - from));
  return { from: Math.min(from, total - size), size };
}

/**
 * 칸 하나를 다른 자리로 옮긴다 — 레이어를 끌어 옮기는 일.
 *
 * 「위로 / 아래로」 버튼은 한 칸씩만 움직여서, 여섯 층 중 맨 아래를 맨 위로
 * 올리려면 다섯 번을 눌러야 했다. 목록에서 끌어 놓으면 한 번이다.
 */
export function reorderSlot(slots: LayoutSlot[], from: number, to: number): LayoutSlot[] {
  const last = slots.length - 1;
  if (from < 0 || to < 0 || from > last || to > last || from === to) return slots;

  const next = [...slots];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
