// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import {
  fitFontSize,
  slotRect,
  targetFontSize,
  type CardSize,
  type LayoutSlot,
  type PixelRect,
  type TextSource,
  type TextStyle,
} from "@fixup/layout-core";
import type { CardCopy } from "@fixup/sns-core";
import { defaultFontDir, resolveFont } from "./fonts";

/**
 * 칸을 겹쳐 카드 한 장을 만든다. **여기만 sharp 를 쓴다.**
 *
 * 원칙 하나 — **카드는 나온다.** 그림 한 칸이 실패해도 그 칸만 회색으로 두고
 * 나머지를 그린다. 한 칸 때문에 열 장을 못 만들면 안 된다.
 *
 * "AI 이미지" 표기는 여기서 붙이지 않는다. 저장 경로가 붙인다 — 이 파일이
 * `server-only` 를 물면 폰트 없는 환경에서 시험할 수 없게 된다.
 */

/** 그림을 못 받은 칸을 채우는 색. 빈 자리라는 것이 보여야 한다. */
const MISSING_IMAGE_FILL = "#E5E7EB";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface ComposeInput {
  size: CardSize;
  /** 배열 순서가 곧 쌓이는 순서다. 뒤쪽이 위에 그려진다. */
  slots: LayoutSlot[];
  copy: CardCopy;
  /** 칸 번호(`slots` 의 자리) → AI 가 그린 그림. */
  images?: Record<number, Buffer>;
  /** 칸 번호 → 라이브러리에서 가져온 로고 그림. */
  logos?: Record<number, Buffer>;
  /** 뼈대 미리보기. 그림·로고가 아직 없는 것이 정상이라 알리지 않는다. */
  preview?: boolean;
  fontDir?: string;
}

export interface ComposeResult {
  png: Buffer;
  /** 사람에게 보여 줄 말. 카드는 이미 나와 있다. */
  warnings: string[];
}

type Layer = { input: Buffer; left: number; top: number };

/** 눈에 안 보이는 글자. trim 은 이것들을 못 지운다. */
const INVISIBLE_CODES = new Set([0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff]);

function stripInvisible(raw: string): string {
  return [...raw].filter((character) => !INVISIBLE_CODES.has(character.codePointAt(0) ?? 0)).join("");
}

/**
 * 원고에 없는 칸은 통째로 비운다. 빈 상자를 그리지 않는다.
 *
 * 보이지 않는 글자만 든 것도 빈 칸이다. 그대로 넘기면 sharp 가
 * "text: no text to render" 라는 영문 오류를 사람 화면에 띄운다.
 */
export function textFor(source: TextSource, copy: CardCopy): string | undefined {
  const raw = source.from === "fixed" ? source.text : copy[source.field];
  const trimmed = raw === undefined ? undefined : stripInvisible(raw).trim();
  return trimmed ? trimmed : undefined;
}

function escapeMarkup(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function solidLayer(rect: PixelRect, fill: string): Promise<Layer> {
  const input = await sharp({
    create: { width: rect.width, height: rect.height, channels: 4, background: fill },
  }).png().toBuffer();
  return { input, left: rect.left, top: rect.top };
}

/**
 * 칸을 넘어선 그림은 캔버스 밖으로 나가기 전에 잘라 낸다.
 *
 * sharp 는 캔버스를 벗어나는 겹치기를 아예 거부한다. 글이 60%까지 줄여도
 * 안 들어가는 경우가 실제로 있고, 그때 카드 전체가 안 나오면 안 된다.
 */
async function clampToCanvas(image: Buffer, left: number, top: number, size: CardSize): Promise<Layer | undefined> {
  const meta = await sharp(image).metadata();
  if (!meta.width || !meta.height) return undefined;

  const placedLeft = Math.max(0, Math.min(left, size.width - 1));
  const placedTop = Math.max(0, Math.min(top, size.height - 1));
  const width = Math.min(meta.width, size.width - placedLeft);
  const height = Math.min(meta.height, size.height - placedTop);
  if (width <= 0 || height <= 0) return undefined;

  const cropped = width === meta.width && height === meta.height
    ? image
    : await sharp(image).extract({ left: 0, top: 0, width, height }).png().toBuffer();
  return { input: cropped, left: placedLeft, top: placedTop };
}

interface DrawnText {
  layer?: Layer;
  warnings: string[];
}

async function drawText(
  rect: PixelRect,
  text: string,
  style: TextStyle,
  size: CardSize,
  fontDir: string,
): Promise<DrawnText> {
  const warnings: string[] = [];
  // 색은 마크업 속성 안으로 들어간다. 경계에서 hex 만 받지만, 표에 직접 쓴
  // 값이 여기까지 오면 따옴표 하나로 마크업이 열린다. 여기서 못 박는다.
  const color = HEX_COLOR.test(style.color) ? style.color : "#111111";
  const markup = `<span foreground="${color}">${escapeMarkup(text)}</span>`;

  const render = async (fontPx: number): Promise<Buffer> => {
    const font = resolveFont(style.family, style.weight, fontPx, fontDir);
    if (font.warning && !warnings.includes(font.warning)) warnings.push(font.warning);
    return sharp({
      text: {
        text: markup,
        font: font.description,
        ...(font.file ? { fontfile: font.file } : {}),
        width: rect.width,
        align: style.align === "center" ? "centre" : style.align,
        // Pango 는 pt 로 센다. dpi 72 에서 1pt 가 1px 이라 칸 계산과 눈금이 맞는다.
        dpi: 72,
        spacing: Math.round(fontPx * (style.lineHeight - 1)),
        rgba: true,
      },
    }).png().toBuffer();
  };

  const fitted = await fitFontSize({
    targetPx: targetFontSize(rect, style.sizeRatio),
    box: rect,
    measure: async (fontPx) => {
      const meta = await sharp(await render(fontPx)).metadata();
      return { width: meta.width ?? 0, height: meta.height ?? 0 };
    },
  });

  const drawn = await render(fitted.fontPx);
  const meta = await sharp(drawn).metadata();
  const width = meta.width ?? rect.width;
  const height = meta.height ?? rect.height;

  if (fitted.overflow) {
    warnings.push(`글이 칸을 넘칩니다. 글꼴을 가장 작게 줄였는데도 「${text.slice(0, 12)}…」 가 들어가지 않습니다.`);
  }

  const left = rect.left + offsetFor(style.align, rect.width, width);
  const top = rect.top + offsetFor(style.valign, rect.height, height);
  return { layer: await clampToCanvas(drawn, left, top, size), warnings };
}

function offsetFor(align: TextStyle["align"] | TextStyle["valign"], box: number, drawn: number): number {
  if (align === "center" || align === "middle") return Math.round((box - drawn) / 2);
  if (align === "right" || align === "bottom") return box - drawn;
  return 0;
}

async function drawImage(rect: PixelRect, bytes: Buffer): Promise<Layer> {
  // 칸 비율대로 요청했으니 평소에는 그대로 맞는다. 어긋난 그림만 가운데를 오려 쓴다.
  const input = await sharp(bytes)
    .resize(rect.width, rect.height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  return { input, left: rect.left, top: rect.top };
}

async function drawLogo(rect: PixelRect, bytes: Buffer): Promise<Layer> {
  // 로고는 잘리면 다른 로고가 된다. 반드시 통째로 넣는다.
  const input = await sharp(bytes)
    .resize(rect.width, rect.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return { input, left: rect.left, top: rect.top };
}

export async function composeCard(input: ComposeInput): Promise<ComposeResult> {
  const fontDir = input.fontDir ?? defaultFontDir();
  const warnings: string[] = [];
  const layers: Layer[] = [];

  for (const [offset, slot] of input.slots.entries()) {
    const rect = slotRect(slot.box, input.size);
    const where = `${offset + 1}번 칸`;

    if (slot.kind === "background") {
      try {
        layers.push(await solidLayer(rect, slot.fill));
      } catch (error) {
        // 색 하나 때문에 카드 전체를 잃을 수는 없다.
        warnings.push(`${where}의 배경색을 칠하지 못했습니다: ${message(error)}`);
      }
      continue;
    }

    if (slot.kind === "image") {
      const bytes = input.images?.[offset];
      if (!bytes) {
        if (!input.preview) {
          warnings.push(`${where}의 그림을 받지 못했습니다. 그 자리를 비워 두고 카드를 만들었습니다.`);
        }
        layers.push(await solidLayer(rect, MISSING_IMAGE_FILL));
        continue;
      }
      try {
        layers.push(await drawImage(rect, bytes));
      } catch (error) {
        warnings.push(`${where}의 그림을 넣지 못했습니다: ${message(error)}`);
        layers.push(await solidLayer(rect, MISSING_IMAGE_FILL));
      }
      continue;
    }

    if (slot.kind === "logo") {
      const bytes = input.logos?.[offset];
      if (!bytes) {
        // 로고는 대신 그릴 수 없다. 회색 상자를 두면 그게 로고인 줄 안다.
        if (!input.preview) warnings.push(`${where}의 로고 그림이 없어 그 칸을 비웠습니다.`);
        continue;
      }
      try {
        layers.push(await drawLogo(rect, bytes));
      } catch (error) {
        warnings.push(`${where}의 로고를 넣지 못했습니다: ${message(error)}`);
      }
      continue;
    }

    const text = textFor(slot.source, input.copy);
    if (!text) continue;
    try {
      const drawn = await drawText(rect, text, slot.style, input.size, fontDir);
      warnings.push(...drawn.warnings);
      if (drawn.layer) layers.push(drawn.layer);
    } catch (error) {
      warnings.push(`${where}의 글자를 그리지 못했습니다: ${message(error)}`);
    }
  }

  const png = await sharp({
    create: { width: input.size.width, height: input.size.height, channels: 4, background: "#FFFFFF" },
  }).composite(layers).png().toBuffer();

  return { png, warnings };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류";
}
