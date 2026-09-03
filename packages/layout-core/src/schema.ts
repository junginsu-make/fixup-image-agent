import { z } from "zod";
import { MAX_CARDS, MIN_CARDS } from "@fixup/sns-core";
import type { LayoutDeck } from "./deck";
import type { CardTemplate } from "./template";
import { FONT_FAMILY_PATTERN, type LayoutSlot } from "./slots";

/**
 * 경계에서 검사한다.
 *
 * 칸은 화면에서 사람이 드래그해 만든 것이 그대로 서버로 온다. 안쪽 코드는
 * 믿어도 되지만 **밖에서 들어온 것은 믿지 않는다.** 좌표가 0~1 밖이거나
 * 색이 hex 가 아니면 여기서 막는다 — 합성까지 흘러가면 sharp 가 알 수 없는
 * 오류로 죽는다.
 */

/** 한 카드에 칸이 스물넷이면 뼈대가 아니라 사고다. */
export const MAX_TEMPLATE_SLOTS = 24;

/**
 * 글 칸은 열넷까지.
 *
 * 글 칸 하나는 「넣어 보고 안 들어가면 줄여서 다시」라 렌더가 여러 번이다.
 * 상한이 없으면 정상 범위의 요청 하나로 서버가 몇 초씩 묶인다(실측).
 *
 * 실제 홍보 카드는 글 자리가 열 개 안팎이라 여덟은 너무 좁았다. 대신
 * 재는 횟수를 반씩 갈라 찾도록 줄여(`fit.ts`) 칸이 늘어도 값이 덜 든다.
 */
export const MAX_TEXT_SLOTS = 14;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const Ratio = z.number().min(0).max(1);

export const SlotBoxSchema = z.object({
  x: Ratio,
  y: Ratio,
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
});

export const TextStyleSchema = z.object({
  family: z.string().regex(FONT_FAMILY_PATTERN),
  weight: z.union([z.literal(400), z.literal(700)]),
  sizeRatio: z.number().gt(0).max(2),
  lineHeight: z.number().min(0.8).max(3),
  color: z.string().regex(HEX_COLOR),
  align: z.enum(["left", "center", "right"]),
  valign: z.enum(["top", "middle", "bottom"]),
});

export const TextSourceSchema = z.union([
  z.object({ from: z.literal("copy"), field: z.enum(["headline", "body", "accent", "footnote"]) }),
  z.object({ from: z.literal("fixed"), text: z.string().min(1).max(500) }),
]);

export const LayoutSlotSchema: z.ZodType<LayoutSlot> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("background"), box: SlotBoxSchema, fill: z.string().regex(HEX_COLOR) }),
  z.object({ kind: z.literal("image"), box: SlotBoxSchema, brief: z.string().max(600).optional() }),
  z.object({
    kind: z.literal("logo"),
    box: SlotBoxSchema,
    // 아직 안 고른 칸은 빈 문자열로 온다. 합성이 그 칸을 비운다.
    referenceImageId: z.string().max(200),
    fit: z.literal("contain"),
  }),
  z.object({ kind: z.literal("text"), box: SlotBoxSchema, source: TextSourceSchema, style: TextStyleSchema }),
]);

/** 카드 한 장의 칸 목록. 뼈대와 세트가 같은 상한을 쓴다. */
export const SlotListSchema = z.array(LayoutSlotSchema)
  .min(1)
  .max(MAX_TEMPLATE_SLOTS)
  .refine(
    (slots) => slots.filter((slot) => slot.kind === "text").length <= MAX_TEXT_SLOTS,
    { message: `글 칸은 ${MAX_TEXT_SLOTS}개까지입니다.` },
  );

export const CardTemplateSchema: z.ZodType<CardTemplate> = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(80),
  role: z.enum(["cover", "body", "ending"]),
  slots: SlotListSchema,
});

/**
 * 세트 — 표지·속지·엔딩 세 자리가 모두 있어야 한다.
 *
 * 한 자리가 비면 그 자리 카드가 빈 종이로 나온다. 만들고 나서 알면 늦다.
 */
export const LayoutDeckSchema: z.ZodType<LayoutDeck> = z.object({
  name: z.string().min(1).max(80),
  ratio: z.string().min(1).max(20),
  total: z.number().int().min(MIN_CARDS).max(MAX_CARDS),
  frames: z.object({ cover: SlotListSchema, body: SlotListSchema, ending: SlotListSchema }),
});

/**
 * 표에서 읽은 값을 다시 검사한다.
 *
 * 회원은 브라우저의 publishable key 로 PostgREST 에 직접 쓸 수 있다 — 우리
 * API 의 zod 를 지나지 않는 길이 있다는 뜻이다. **쓸 때 막았으니 읽을 때는
 * 믿어도 된다는 말은 여기서 성립하지 않는다.**
 *
 * 어긋난 행 하나 때문에 목록 전체가 죽으면 안 되므로, 못 읽은 것은 버리고
 * 나머지는 그대로 쓴다.
 */
export function parseStoredSlots(value: unknown): LayoutSlot[] | undefined {
  const parsed = SlotListSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function parseStoredFrames(value: unknown): LayoutDeck["frames"] | undefined {
  const parsed = z.object({
    cover: SlotListSchema,
    body: SlotListSchema,
    ending: SlotListSchema,
  }).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
