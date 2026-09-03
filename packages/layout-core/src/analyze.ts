import { z } from "zod";
import type { LayoutSlot, SlotBox, TextField, TextSource, TextStyle } from "./slots";
import { DEFAULT_FONT_FAMILY } from "./template";

/**
 * B — 레퍼런스에서 칸을 읽어낸다.
 *
 * 받은 값을 **믿지 않는다.** 비전 모델은 0~1 밖의 좌표도, 넓이 0 인 칸도,
 * 아홉 개짜리 목록도 태연히 돌려준다. 여기서 다 걸러 낸 다음에야 화면에
 * 올린다. 초안까지가 이 함수의 일이고, 마무리는 사람이 화면에서 한다.
 */

/**
 * 읽어낼 칸의 상한.
 *
 * 실측: 매장 홍보 카드 한 장에서 12칸이 나온다(제목 두 줄·라벨·주소·전화번호·
 * 지도·사진·로고…). 여덟에서 자르면 전화번호나 주소가 소리 없이 사라진다.
 * 스무 개를 넘으면 그건 카드를 읽은 게 아니라 글자마다 상자를 친 것이다.
 */
export const MAX_ANALYZED_SLOTS = 20;

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
          color: { type: "string" },
          align: { type: "string", enum: ["left", "center", "right"] },
          weight: { type: "string", enum: ["regular", "bold"] },
          fillRatio: { type: "number" },
          text: { type: "string" },
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
  color: z.string().optional(),
  align: z.string().optional(),
  weight: z.string().optional(),
  fillRatio: z.number().optional(),
  text: z.string().optional(),
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

const HEX = /^#[0-9a-f]{6}$/i;

const TEXT_FIELDS: TextField[] = ["headline", "body", "accent", "footnote"];

const TEXT_SIZE_RATIO: Record<TextField, number> = {
  // 읽어낸 상자는 글자를 바짝 감싼다. 칸 높이에 가까운 크기에서 시작한다.
  headline: 0.5,
  body: 0.28,
  accent: 0.6,
  footnote: 0.6,
};

const ALIGNS: TextStyle["align"][] = ["left", "center", "right"];

/**
 * 읽어낸 디자인을 그대로 쓴다 — **못 읽은 것만** 기본으로 채운다.
 *
 * 위치만 읽고 색·정렬·굵기를 버리면 흰 글씨 카드가 검은 글씨로 나온다.
 * 「레퍼런스처럼」이 이 기능의 전부라, 보이는 대로 가져와야 한다.
 *
 * 다만 값은 **믿지 않는다.** 모델은 「연두색」이나 99 같은 것도 태연히 준다.
 */
function textStyle(field: TextField, raw: RawSlot): TextStyle {
  const bold = raw.weight === "bold" ? true : raw.weight === "regular" ? false : undefined;
  const align = ALIGNS.find((entry) => entry === raw.align);
  const fill = raw.fillRatio;

  return {
    family: DEFAULT_FONT_FAMILY,
    weight: (bold ?? (field === "headline" || field === "accent")) ? 700 : 400,
    sizeRatio: fill !== undefined && fill > 0.05 && fill <= 2 ? fill : TEXT_SIZE_RATIO[field],
    lineHeight: field === "body" ? 1.5 : 1.25,
    color: HEX.test(raw.color?.trim() ?? "") ? raw.color!.trim().toUpperCase() : "#111111",
    align: align ?? "left",
    valign: "top",
  };
}

function hexOrWhite(fill?: string): string {
  return fill && HEX.test(fill.trim()) ? fill.trim().toUpperCase() : "#FFFFFF";
}

/**
 * 글 자리를 원고 칸에 잇는다 — **한 칸에 한 번씩만.**
 *
 * 레퍼런스에는 글 자리가 일곱인데 원고는 넉 칸(제목·본문·강조·작은글씨)뿐이다.
 * 그대로 이으면 같은 문장이 네 번 반복된다(실측).
 *
 * 그래서 자리마다 처음 한 번만 잇고, 남는 자리는 **레퍼런스에 써 있던 글을
 * 그대로 둔다.** 「오시는 길」 같은 라벨은 원래 고정이고, 주소·전화번호는
 * 사람이 자기 것으로 고치면 된다.
 *
 * 읽어낸 글이 없으면 고정할 것이 없으니 원고 자리로 두고 채워지길 기다린다.
 */
function textSource(field: TextField, raw: RawSlot, used: Set<TextField>): TextSource {
  const written = raw.text?.trim();
  if (used.has(field) && written) return { from: "fixed", text: written.slice(0, 500) };
  used.add(field);
  return { from: "copy", field };
}

function toSlot(raw: RawSlot, box: SlotBox, used: Set<TextField>): LayoutSlot | undefined {
  switch (raw.kind) {
    case "background":
      return { kind: "background", box, fill: hexOrWhite(raw.fill) };
    case "image":
      // 무엇을 그릴지는 카드 기획이 정한다. 레퍼런스에서 읽어낼 것이 아니다.
      return { kind: "image", box };
    case "logo":
      // 어느 그림을 놓을지는 사람이 고른다. 모델이 고를 수 있는 것이 아니다.
      return { kind: "logo", box, referenceImageId: "", fit: "contain" };
    case "text": {
      const field = TEXT_FIELDS.find((entry) => entry === raw.textRole) ?? "headline";
      return { kind: "text", box, source: textSource(field, raw, used), style: textStyle(field, raw) };
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

/**
 * 문자열로 감싸 온 것을 되살린다.
 *
 * **실측(2026-09-03): 카드 한 장을 보내면 Claude 가 칸 목록을 JSON 문자열로
 * 만들어 넣는다.** `{"slots": "{\"slots\":[...]}"}` 모양이다. 도구 호출
 * 형식이 흐트러지는 것이지 잘린 것이 아니다 — 저장소가 이미 겪은 일이라
 * `apps/web/lib/llm/structured.ts` 에 같은 대책이 있다.
 *
 * 못 풀면 멀쩡히 읽어낸 칸 여덟 개를 통째로 버리고 「못 읽었다」고 말한다.
 * 한 겹이든 두 겹이든 벗겨 본다.
 */
function unwrap(raw: unknown, depth = 0): unknown {
  if (depth > 3) return raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return raw;
    try {
      return unwrap(JSON.parse(trimmed), depth + 1);
    } catch {
      return raw; // 원래 그런 문자열일 수도 있다. 건드리지 않는다.
    }
  }

  // 목록만 문자열로 감싼 경우. 풀어 보면 배열이거나 다시 { slots } 다.
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    if (typeof record.slots !== "string") return raw;
    const inner = unwrap(record.slots, depth + 1);
    if (Array.isArray(inner)) return { ...record, slots: inner };
    if (inner && typeof inner === "object" && "slots" in inner) return inner;
  }
  return raw;
}

export function normalizeAnalysis(rawInput: unknown): AnalyzedLayout {
  const raw = unwrap(rawInput);
  const parsed = RawAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    return { slots: [], issues: ["레퍼런스에서 칸 목록을 읽지 못했습니다. 직접 만들어 주세요."] };
  }

  const issues: string[] = [];
  // 원고 칸을 이미 쓴 자리. 두 번째부터는 레퍼런스의 글을 그대로 둔다.
  const used = new Set<TextField>();
  const slots = parsed.data.slots.flatMap((entry) => {
    const slot = RawSlotSchema.safeParse(entry);
    if (!slot.success) return [];
    const box = clampBox(slot.data);
    if (!box) return [];
    const built = toSlot(slot.data, box, used);
    return built ? [built] : [];
  });

  const kept = keepLargest(slots);
  if (kept.length < slots.length) {
    issues.push(`칸을 ${slots.length}개 읽었습니다. 큰 것부터 ${MAX_ANALYZED_SLOTS}개만 남겼습니다.`);
  }
  if (kept.length === 0) {
    issues.push("레퍼런스에서 칸을 읽어내지 못했습니다. 직접 만들어 주세요.");
  }
  if (kept.some((slot) => slot.kind === "logo")) {
    issues.push("로고 칸에 넣을 그림은 라이브러리에서 직접 골라 주세요.");
  }
  return { slots: kept, issues };
}
