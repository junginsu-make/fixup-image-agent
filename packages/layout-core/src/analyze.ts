import { z } from "zod";
import type { LayoutSlot, SlotBox, TextField, TextStyle } from "./slots";
import { DEFAULT_FONT_FAMILY } from "./template";

/**
 * B — 레퍼런스에서 칸을 읽어낸다.
 *
 * 받은 값을 **믿지 않는다.** 비전 모델은 0~1 밖의 좌표도, 넓이 0 인 칸도,
 * 아홉 개짜리 목록도 태연히 돌려준다. 여기서 다 걸러 낸 다음에야 화면에
 * 올린다. 초안까지가 이 함수의 일이고, 마무리는 사람이 화면에서 한다.
 */

/** 한 카드에 칸이 아홉이면 대개 잘못 읽은 것이다. */
export const MAX_ANALYZED_SLOTS = 8;

export const LAYOUT_ANALYSIS_PROMPT = [
  "이 카드 이미지에서 영역을 찾아 주세요. 좌표는 0~1 비율입니다.",
  "- 글이 있는 영역 → text (헤드라인/본문/작은 글씨 중 무엇인지 textRole 에 적으세요)",
  "- 사진·일러스트 영역 → image",
  "- 로고·심볼 영역 → logo",
  "- 전체를 덮는 단색 → background (그 색의 hex 를 fill 에 적으세요)",
  "겹치는 영역은 뒤에 있는 것이 위입니다. 확실하지 않으면 넣지 마세요.",
].join("\n");

/** 구조화 응답 제공자(`StructuredProvider`)에 그대로 넘기는 스키마. */
export const LAYOUT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    slots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["background", "image", "logo", "text"] },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          textRole: { type: "string", enum: ["headline", "body", "accent", "footnote"] },
          fill: { type: "string" },
        },
        required: ["kind", "x", "y", "width", "height"],
        additionalProperties: false,
      },
    },
  },
  required: ["slots"],
  additionalProperties: false,
} as const;

const RawSlotSchema = z.object({
  kind: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  textRole: z.string().optional(),
  fill: z.string().optional(),
  brief: z.string().optional(),
});

const RawAnalysisSchema = z.object({ slots: z.array(z.unknown()) });

type RawSlot = z.infer<typeof RawSlotSchema>;

export interface AnalyzedLayout {
  slots: LayoutSlot[];
  /** 사람에게 보여 줄 말. 실패가 아니라 「이건 손봐야 한다」는 안내다. */
  issues: string[];
}

/** 소수점 넷째 자리까지. 잘라 맞추면서 생긴 0.19999… 를 0.2 로 되돌린다. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clampBox(raw: RawSlot): SlotBox | undefined {
  if (raw.width <= 0 || raw.height <= 0) return undefined;
  const x = Math.min(1, Math.max(0, raw.x));
  const y = Math.min(1, Math.max(0, raw.y));
  const width = round4(Math.min(1, raw.x + raw.width) - x);
  const height = round4(Math.min(1, raw.y + raw.height) - y);
  if (width <= 0 || height <= 0) return undefined;
  return { x: round4(x), y: round4(y), width, height };
}

const TEXT_FIELDS: TextField[] = ["headline", "body", "accent", "footnote"];

const TEXT_SIZE_RATIO: Record<TextField, number> = {
  // 읽어낸 상자는 글자를 바짝 감싼다. 칸 높이에 가까운 크기에서 시작한다.
  headline: 0.5,
  body: 0.28,
  accent: 0.6,
  footnote: 0.6,
};

function textStyle(field: TextField): TextStyle {
  return {
    family: DEFAULT_FONT_FAMILY,
    weight: field === "headline" || field === "accent" ? 700 : 400,
    sizeRatio: TEXT_SIZE_RATIO[field],
    lineHeight: field === "body" ? 1.5 : 1.25,
    color: "#111111",
    align: "left",
    valign: "top",
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

function hexOrWhite(fill?: string): string {
  return fill && HEX.test(fill.trim()) ? fill.trim().toUpperCase() : "#FFFFFF";
}

function toSlot(raw: RawSlot, box: SlotBox): LayoutSlot | undefined {
  switch (raw.kind) {
    case "background":
      return { kind: "background", box, fill: hexOrWhite(raw.fill) };
    case "image":
      return raw.brief ? { kind: "image", box, brief: raw.brief } : { kind: "image", box };
    case "logo":
      // 어느 그림을 놓을지는 사람이 고른다. 모델이 고를 수 있는 것이 아니다.
      return { kind: "logo", box, referenceImageId: "", fit: "contain" };
    case "text": {
      const field = TEXT_FIELDS.find((entry) => entry === raw.textRole) ?? "headline";
      return { kind: "text", box, source: { from: "copy", field }, style: textStyle(field) };
    }
    default:
      return undefined;
  }
}

/**
 * 큰 것부터 남기되 쌓는 순서는 그대로 둔다.
 *
 * 크기 순으로 다시 늘어놓으면 배경이 글 위로 올라가 글자를 덮는다.
 */
function keepLargest(slots: LayoutSlot[]): LayoutSlot[] {
  if (slots.length <= MAX_ANALYZED_SLOTS) return slots;
  const kept = new Set(
    slots
      .map((slot, offset) => ({ offset, area: slot.box.width * slot.box.height }))
      .sort((first, second) => second.area - first.area)
      .slice(0, MAX_ANALYZED_SLOTS)
      .map((entry) => entry.offset),
  );
  return slots.filter((_slot, offset) => kept.has(offset));
}

export function normalizeAnalysis(raw: unknown): AnalyzedLayout {
  const parsed = RawAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    return { slots: [], issues: ["레퍼런스에서 칸 목록을 읽지 못했습니다. 직접 만들어 주세요."] };
  }

  const issues: string[] = [];
  const slots = parsed.data.slots.flatMap((entry) => {
    const slot = RawSlotSchema.safeParse(entry);
    if (!slot.success) return [];
    const box = clampBox(slot.data);
    if (!box) return [];
    const built = toSlot(slot.data, box);
    return built ? [built] : [];
  });

  const kept = keepLargest(slots);
  if (kept.length < slots.length) {
    issues.push(`칸을 ${slots.length}개 읽었습니다. 큰 것부터 여덟 개만 남겼습니다.`);
  }
  if (kept.length === 0) {
    issues.push("레퍼런스에서 칸을 읽어내지 못했습니다. 직접 만들어 주세요.");
  }
  if (kept.some((slot) => slot.kind === "logo")) {
    issues.push("로고 칸에 넣을 그림은 라이브러리에서 직접 골라 주세요.");
  }
  return { slots: kept, issues };
}
