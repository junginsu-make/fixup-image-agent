/**
 * /create 편집기의 순수 로직 — 훅·JSX 없음.
 *
 * PdpEditor.tsx(2,802줄) 안에서 UI 와 뒤엉켜 있던 것을 2026-07-21 UI 개편 때
 * 그대로 옮겼다. 로직은 한 줄도 바꾸지 않았다.
 *
 * ⚠️ buildOverlayShellStyle / buildOverlayBackgroundStyle / buildOverlayTextStyle /
 *    buildShapeLayerStyle 네 개는 화면 표시와 buildExportNode(html2canvas 내보내기)가
 *    함께 쓴다. 보기 좋게 고치면 사용자가 내려받는 결과물이 바뀐다.
 *    zIndex 계산도 레이어 쌓임 모델이라 장식이 아니다.
 */

import type { CSSProperties } from "react";
import html2canvas from "html2canvas";
import type {
  AspectRatio,
  GeneratedResult,
  ImageGenOptions,
  PdpCopyLanguage,
  ReferenceModelUsage,
} from "@fixup/pdp-core";
import type {
  CanvasLayer,
  FloatingWorkbenchState,
  ShapeLayer,
  TextOverlay,
} from "./pdp-drafts";

export interface ImageColorRecommendations {

  photoColors: string[];
  recommendedTextColors: string[];
  recommendedShapeColors: string[];
  accentColor: string;
  darkColor: string;
  lightColor: string;
}

export const DEFAULT_COLOR_RECOMMENDATIONS: ImageColorRecommendations = {
  photoColors: ["#e8ddcb", "#102532", "#7a6b5a", "#d5b692"],
  recommendedTextColors: ["#ffffff", "#102532", "#f4efe6", "#4cb7aa"],
  recommendedShapeColors: ["#102532", "#1d3748", "#f4efe6", "#85735e", "#c8474d"],
  accentColor: "#4cb7aa",
  darkColor: "#102532",
  lightColor: "#f4efe6",
};

// ── Pure helper functions (no hooks, SSR-safe where noted) ────────────────

export function buildOverlayShellStyle(overlay: TextOverlay): CSSProperties {
  const padding = getOverlayPadding(overlay.fontSize);

  return {
    position: "relative",
    width: "100%",
    height: "100%",
    padding: `${padding.vertical}px ${padding.horizontal}px`,
  };
}

export function buildOverlayBackgroundStyle(overlay: TextOverlay): CSSProperties {
  return {
    backgroundColor: toRgba(overlay.backgroundColor, overlay.backgroundOpacity),
    borderRadius: `${overlay.backgroundRadius}px`,
  };
}

export function buildShapeLayerStyle(layer: ShapeLayer): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    backgroundColor: toRgba(layer.fillColor, layer.fillOpacity),
    borderRadius: `${layer.borderRadius}px`,
  };
}

export async function buildExportNode(input: { imageSrc: string; width: number; layers: CanvasLayer[] }) {
  const image = await loadImage(input.imageSrc);
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round((image.naturalHeight / Math.max(image.naturalWidth, 1)) * width));

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.background = "transparent";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "-1";

  const imageEl = document.createElement("img");
  imageEl.src = input.imageSrc;
  imageEl.alt = "";
  imageEl.draggable = false;
  imageEl.style.display = "block";
  imageEl.style.width = "100%";
  imageEl.style.height = "100%";
  imageEl.style.objectFit = "cover";
  container.appendChild(imageEl);

  const shapeLayers = input.layers.filter(isShapeLayer);
  const textLayers = input.layers.filter(isTextLayer);

  for (const layer of [...shapeLayers, ...textLayers]) {
    const layerEl = document.createElement("div");
    layerEl.style.position = "absolute";
    layerEl.style.left = `${layer.x}px`;
    layerEl.style.top = `${layer.y}px`;
    layerEl.style.width = `${toNumericSize(layer.width, width)}px`;
    layerEl.style.height = `${toNumericSize(layer.height, height)}px`;

    if (isShapeLayer(layer)) {
      const shapeSurface = document.createElement("div");
      shapeSurface.style.width = "100%";
      shapeSurface.style.height = "100%";
      shapeSurface.style.backgroundColor = toRgba(layer.fillColor, layer.fillOpacity);
      shapeSurface.style.borderRadius = `${layer.borderRadius}px`;
      shapeSurface.style.border = "1px solid rgba(255, 255, 255, 0.18)";
      shapeSurface.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 12px 28px rgba(8, 16, 28, 0.18)";
      layerEl.appendChild(shapeSurface);
    } else {
      const shell = document.createElement("div");
      const shellStyle = buildOverlayShellStyle(layer);
      applyInlineStyle(shell, shellStyle);
      shell.style.overflow = "visible";

      if (layer.backgroundEnabled) {
        const backdrop = document.createElement("div");
        backdrop.style.position = "absolute";
        backdrop.style.inset = "0";
        const backdropStyle = buildOverlayBackgroundStyle(layer);
        applyInlineStyle(backdrop, backdropStyle);
        shell.appendChild(backdrop);
      }

      const textEl = document.createElement("div");
      textEl.textContent = layer.text;
      const textStyle = buildOverlayTextStyle(layer);
      applyInlineStyle(textEl, textStyle);
      textEl.style.position = "relative";
      textEl.style.zIndex = "1";
      shell.appendChild(textEl);
      layerEl.appendChild(shell);
    }

    container.appendChild(layerEl);
  }

  return container;
}

export function applyInlineStyle(target: HTMLElement, style: CSSProperties) {
  Object.entries(style).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const cssKey = key.replace(/[A-Z]/g, (segment) => `-${segment.toLowerCase()}`);
    target.style.setProperty(cssKey, String(value));
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function sanitizeSectionFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

export function buildOverlayTextStyle(overlay: TextOverlay): CSSProperties {
  return {
    display: "block",
    width: "100%",
    height: "100%",
    color: overlay.color,
    fontFamily: overlay.fontFamily,
    fontSize: `${overlay.fontSize}px`,
    fontWeight: overlay.fontWeight,
    lineHeight: overlay.lineHeight,
    textAlign: overlay.textAlign,
    whiteSpace: "pre-wrap",
    wordBreak: "keep-all",
    textShadow: overlay.shadowEnabled
      ? `0px ${overlay.shadowOffsetY}px ${overlay.shadowBlur}px ${toRgba(overlay.shadowColor, overlay.shadowOpacity)}`
      : "none",
  };
}

/**
 * ⚠️ 키를 숫자로 바꾸지 말 것.
 * 레이어는 섹션 고유 키(예: "S1")로 저장한다. 예전에는 Number(key)로 강제
 * 변환했는데, 그러면 고유 키가 전부 NaN 이 되어 모든 섹션의 레이어가
 * 한 곳으로 뭉개진다.
 */
export function normalizeOverlayRecord(record: Record<string, CanvasLayer[]>) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, overlays]) => [
      key,
      (Array.isArray(overlays) ? overlays : []).map((overlay) => normalizeCanvasLayer(overlay)),
    ])
  ) as Record<string, CanvasLayer[]>;
}

export function normalizeCanvasLayer(layer: Partial<CanvasLayer> & Pick<CanvasLayer, "id" | "x" | "y" | "width" | "height">) {
  if (layer.kind === "shape") {
    return normalizeShapeLayer(layer as Partial<ShapeLayer> & Pick<ShapeLayer, "id" | "x" | "y" | "width" | "height">);
  }

  return normalizeTextOverlay(
    layer as Partial<TextOverlay> &
      Pick<TextOverlay, "id" | "text" | "x" | "y" | "width" | "height" | "fontSize" | "color" | "fontFamily" | "fontWeight" | "textAlign" | "lineHeight" | "backgroundColor">
  );
}

export function normalizeTextOverlay(
  overlay: Partial<TextOverlay> &
    Pick<TextOverlay, "id" | "text" | "x" | "y" | "width" | "height" | "fontSize" | "color" | "fontFamily" | "fontWeight" | "textAlign" | "lineHeight" | "backgroundColor">
): TextOverlay {
  const hasLegacyBackground = Boolean(overlay.backgroundColor && overlay.backgroundColor !== "transparent");
  const translations = normalizeOverlayTranslations(overlay.translations, overlay.text);
  const language = overlay.language === "en" ? "en" : "ko";

  return {
    ...overlay,
    kind: "text",
    language,
    text: translations[language] || translations.ko,
    translations,
    color: overlay.color ?? "#ffffff",
    backgroundColor: overlay.backgroundColor === "transparent" ? "#102532" : overlay.backgroundColor,
    backgroundEnabled: overlay.backgroundEnabled ?? hasLegacyBackground,
    backgroundOpacity: overlay.backgroundOpacity ?? 0.72,
    backgroundRadius: overlay.backgroundRadius ?? 18,
    shadowEnabled: overlay.shadowEnabled ?? false,
    shadowColor: overlay.shadowColor ?? "#102532",
    shadowOpacity: overlay.shadowOpacity ?? 0.4,
    shadowBlur: overlay.shadowBlur ?? 18,
    shadowOffsetY: overlay.shadowOffsetY ?? 6,
  };
}

export function applyLanguageToTextOverlay(overlay: TextOverlay, nextLanguage: PdpCopyLanguage): TextOverlay {
  const translations = normalizeOverlayTranslations(
    {
      ...overlay.translations,
      [overlay.language]: overlay.text,
    },
    overlay.text
  );
  const nextText = translations[nextLanguage] || translations.ko;

  return normalizeTextOverlay({
    ...overlay,
    language: nextLanguage,
    text: nextText,
    translations: {
      ...translations,
      [nextLanguage]: nextText,
    },
  });
}

export function normalizeShapeLayer(
  layer: Partial<ShapeLayer> & Pick<ShapeLayer, "id" | "x" | "y" | "width" | "height">
): ShapeLayer {
  return {
    ...layer,
    kind: "shape",
    fillColor: layer.fillColor ?? "#102532",
    fillOpacity: layer.fillOpacity ?? 1,
    borderRadius: layer.borderRadius ?? 0,
  };
}

export function getOverlayPadding(fontSize: number) {
  return {
    horizontal: clampValue(Math.round(fontSize * 0.32), 10, 24),
    vertical: clampValue(Math.round(fontSize * 0.18), 8, 18),
  };
}

export function normalizeOverlayTranslations(
  translations: Partial<Record<PdpCopyLanguage, string>> | undefined,
  fallbackText: string
) {
  const ko = translations?.ko?.trim() ? translations.ko : fallbackText;
  const en = translations?.en?.trim() ? translations.en : ko;

  return {
    ko,
    en,
  } satisfies Record<PdpCopyLanguage, string>;
}

export function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function toNumericSize(value: number | string, fallback: number) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function estimateOverlayBox(
  text: string,
  options: {
    fontSize: number;
    fontWeight: string;
    fontFamily: string;
    lineHeight: number;
    maxWidth: number;
  }
) {
  const horizontalPadding = 20;
  const verticalPadding = 12;
  const availableLineWidth = Math.max(120, options.maxWidth - horizontalPadding);
  const lines = text.split("\n").map((line) => line.trimEnd());
  const measure = createTextMeasure(options);

  let wrappedLineCount = 0;
  let widestLine = 0;

  lines.forEach((line) => {
    const targetLine = line || " ";
    const measuredWidth = measure(targetLine);
    widestLine = Math.max(widestLine, Math.min(measuredWidth, availableLineWidth));
    wrappedLineCount += Math.max(1, Math.ceil(measuredWidth / availableLineWidth));
  });

  const lineHeightPx = options.fontSize * options.lineHeight;

  return {
    width: Math.round(
      clampValue(
        Math.max(widestLine + horizontalPadding, Math.min(options.maxWidth, Math.max(220, options.fontSize * 8))),
        96,
        options.maxWidth
      )
    ),
    height: Math.round(clampValue(wrappedLineCount * lineHeightPx + verticalPadding, 40, 220)),
  };
}

export function createTextMeasure(options: { fontSize: number; fontWeight: string; fontFamily: string }) {
  if (typeof document === "undefined") {
    return (text: string) => Math.max(options.fontSize * 1.6, text.length * options.fontSize * 0.58);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return (text: string) => Math.max(options.fontSize * 1.6, text.length * options.fontSize * 0.58);
  }

  context.font = `${options.fontWeight} ${options.fontSize}px ${options.fontFamily}`;
  return (text: string) => context.measureText(text).width;
}

export async function extractImageColorRecommendations(imageSrc: string): Promise<ImageColorRecommendations> {
  if (typeof document === "undefined") {
    return DEFAULT_COLOR_RECOMMENDATIONS;
  }

  try {
    const image = await loadImage(imageSrc);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return DEFAULT_COLOR_RECOMMENDATIONS;
    }

    const width = 48;
    const height = Math.max(48, Math.round((image.naturalHeight / Math.max(image.naturalWidth, 1)) * 48));
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

    for (let index = 0; index < data.length; index += 16) {
      const alpha = data[index + 3];
      if (alpha < 24) {
        continue;
      }

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
      const current = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      current.count += 1;
      current.r += r;
      current.g += g;
      current.b += b;
      buckets.set(key, current);
    }

    const swatches = Array.from(buckets.values())
      .map((bucket) => ({
        count: bucket.count,
        color: {
          r: Math.round(bucket.r / bucket.count),
          g: Math.round(bucket.g / bucket.count),
          b: Math.round(bucket.b / bucket.count),
        },
      }))
      .sort((left, right) => right.count - left.count);

    if (!swatches.length) {
      return DEFAULT_COLOR_RECOMMENDATIONS;
    }

    const dominant = swatches[0]?.color ?? hexToRgb(DEFAULT_COLOR_RECOMMENDATIONS.darkColor);
    const accent =
      swatches
        .slice(0, 8)
        .sort((left, right) => getSaturation(right.color) - getSaturation(left.color))[0]?.color ?? dominant;
    const dark = swatches.find((swatch) => getRelativeLuminance(swatch.color) < 0.34)?.color ?? darkenRgb(dominant, 0.58);
    const light =
      swatches.find((swatch) => getRelativeLuminance(swatch.color) > 0.72)?.color ?? lightenRgb(dominant, 0.68);

    const accentHex = rgbToHex(boostColorPresence(accent));
    const darkHex = rgbToHex(darkenRgb(dark, 0.08));
    const lightHex = rgbToHex(lightenRgb(light, 0.04));
    const complementHex = rgbToHex(rotateHue(accent, 180));
    const mutedAccentHex = rgbToHex(mixRgb(accent, dark, 0.36));
    const warmTintHex = rgbToHex(lightenRgb(mixRgb(accent, light, 0.5), 0.12));
    const deepContrastHex = rgbToHex(darkenRgb(mixRgb(dominant, accent, 0.22), 0.22));

    return {
      photoColors: uniqueColors(swatches.slice(0, 6).map((swatch) => rgbToHex(swatch.color))),
      recommendedTextColors: uniqueColors([
        "#ffffff",
        getRelativeLuminance(dominant) < 0.48 ? "#f9f7f1" : "#102532",
        lightHex,
        darkHex,
        accentHex,
      ]),
      recommendedShapeColors: uniqueColors([
        darkHex,
        mutedAccentHex,
        rgbToHex(mixRgb(light, dark, 0.2)),
        warmTintHex,
        deepContrastHex,
        complementHex,
      ]),
      accentColor: accentHex,
      darkColor: darkHex,
      lightColor: lightHex,
    };
  } catch {
    return DEFAULT_COLOR_RECOMMENDATIONS;
  }
}

export function sortColorsByContrast(colors: string[], against: string | null) {
  if (!against) {
    return uniqueColors(colors);
  }

  const target = hexToRgb(against);
  return uniqueColors(colors).sort(
    (left, right) => contrastScore(hexToRgb(right), target) - contrastScore(hexToRgb(left), target)
  );
}

export function uniqueColors(colors: string[]) {
  return Array.from(new Set(colors.map((color) => color.toLowerCase())));
}

export function contrastScore(left: { r: number; g: number; b: number }, right: { r: number; g: number; b: number }) {
  return Math.abs(getRelativeLuminance(left) - getRelativeLuminance(right));
}

export function getRelativeLuminance(color: { r: number; g: number; b: number }) {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getSaturation(color: { r: number; g: number; b: number }) {
  const [r, g, b] = [color.r / 255, color.g / 255, color.b / 255];
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function lightenRgb(color: { r: number; g: number; b: number }, amount: number) {
  return {
    r: Math.round(color.r + (255 - color.r) * amount),
    g: Math.round(color.g + (255 - color.g) * amount),
    b: Math.round(color.b + (255 - color.b) * amount),
  };
}

export function darkenRgb(color: { r: number; g: number; b: number }, amount: number) {
  return {
    r: Math.round(color.r * (1 - amount)),
    g: Math.round(color.g * (1 - amount)),
    b: Math.round(color.b * (1 - amount)),
  };
}

export function mixRgb(
  left: { r: number; g: number; b: number },
  right: { r: number; g: number; b: number },
  ratio: number
) {
  return {
    r: Math.round(left.r * (1 - ratio) + right.r * ratio),
    g: Math.round(left.g * (1 - ratio) + right.g * ratio),
    b: Math.round(left.b * (1 - ratio) + right.b * ratio),
  };
}

export function boostColorPresence(color: { r: number; g: number; b: number }) {
  const saturation = getSaturation(color);
  if (saturation > 0.3) {
    return color;
  }

  const max = Math.max(color.r, color.g, color.b);
  const next = { ...color };
  if (max === color.r) {
    next.r = clampValue(next.r + 28, 0, 255);
  } else if (max === color.g) {
    next.g = clampValue(next.g + 28, 0, 255);
  } else {
    next.b = clampValue(next.b + 28, 0, 255);
  }
  return next;
}

export function rotateHue(color: { r: number; g: number; b: number }, degrees: number) {
  const { h, s, l } = rgbToHsl(color);
  return hslToRgb({
    h: (h + degrees + 360) % 360,
    s,
    l,
  });
}

export function rgbToHsl(color: { r: number; g: number; b: number }) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }

  return {
    h: h < 0 ? h + 360 : h,
    s,
    l,
  };
}

export function hslToRgb(color: { h: number; s: number; l: number }) {
  const c = (1 - Math.abs(2 * color.l - 1)) * color.s;
  const x = c * (1 - Math.abs(((color.h / 60) % 2) - 1));
  const m = color.l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (color.h < 60) {
    rPrime = c;
    gPrime = x;
  } else if (color.h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (color.h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (color.h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (color.h < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

export function hexToRgb(value: string) {
  const normalized = value.replace("#", "");
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((segment) => `${segment}${segment}`)
          .join("")
      : normalized;
  const numeric = Number.parseInt(hex, 16);

  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

export function rgbToHex(color: { r: number; g: number; b: number }) {
  return `#${[color.r, color.g, color.b]
    .map((channel) => clampValue(channel, 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function toRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clampValue(alpha, 0, 1)})`;
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 색상을 분석하지 못했습니다."));
    image.src = src;
  });
}

export function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "방금";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function anchorWorkbenchToOverlay(
  overlay: CanvasLayer,
  canvasEl: HTMLDivElement | null,
  stageEl: HTMLDivElement | null,
  workbench: FloatingWorkbenchState
) {
  const workbenchWidth = workbench.width;
  const workbenchHeight = workbench.height;
  const gap = 18;
  const stageWidth = stageEl?.clientWidth ?? 1240;
  const stageHeight = stageEl?.clientHeight ?? 720;
  const canvasLeft = canvasEl?.offsetLeft ?? 0;
  const canvasTop = canvasEl?.offsetTop ?? 0;
  const overlayWidth = toNumericSize(overlay.width, 320);

  let x = canvasLeft + overlay.x + overlayWidth + gap;
  if (x + workbenchWidth > stageWidth - 16) {
    x = canvasLeft + overlay.x - workbenchWidth - gap;
  }
  if (x < 12) {
    x = clampValue(canvasLeft + overlay.x + 12, 12, Math.max(12, stageWidth - workbenchWidth - 16));
  }

  const y = clampValue(canvasTop + overlay.y, 12, Math.max(12, stageHeight - workbenchHeight - 16));

  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

export function isTextLayer(layer: CanvasLayer): layer is TextOverlay {
  return layer.kind === "text";
}

export function isShapeLayer(layer: CanvasLayer): layer is ShapeLayer {
  return layer.kind === "shape";
}

export function getWorkbenchPosition(stageEl: HTMLDivElement | null) {
  const width = 332;
  const height = 500;
  const stageWidth = stageEl?.clientWidth ?? 1240;
  const stageHeight = stageEl?.clientHeight ?? 720;

  return {
    x: Math.max(16, stageWidth - width - 20),
    y: 20,
    width,
    height: Math.min(height, Math.max(420, stageHeight - 40)),
    isOpen: true,
  };
}

export function clampWorkbenchToStage(workbench: FloatingWorkbenchState, stageEl: HTMLDivElement | null) {
  if (!stageEl) {
    return workbench;
  }

  const maxX = Math.max(16, stageEl.clientWidth - workbench.width - 16);
  const maxY = Math.max(16, stageEl.clientHeight - workbench.height - 16);

  return {
    ...workbench,
    x: clampValue(workbench.x, 16, maxX),
    y: clampValue(workbench.y, 16, maxY),
  };
}

/**
 * 기본값을 채운다. **받은 것을 먼저 펼친다.**
 *
 * 필드를 하나씩 나열하면 목록에 없는 옵션이 조용히 사라진다. 엔진 쪽에서 똑같은
 * 함수가 `styleReferenceImages`·`preserveProductImage`·`characterReference` 를
 * 삼켜서 레퍼런스와 캐릭터가 한 번도 반영되지 않은 적이 있다. 옵션 타입의 필드가
 * 모두 선택(`?`)이라 타입 검사도 잡아 주지 않는다.
 */
export function normalizeImageOptions(
  options: ImageGenOptions | undefined,
  fallbackWithModel: boolean
): ImageGenOptions & { guidePriorityMode: NonNullable<ImageGenOptions["guidePriorityMode"]> } {
  return {
    ...options,
    style: options?.style ?? "studio",
    withModel: options?.withModel ?? fallbackWithModel,
    modelGender: options?.modelGender ?? "female",
    modelAgeRange: options?.modelAgeRange ?? "20s",
    modelCountry: options?.modelCountry ?? "korea",
    guidePriorityMode: options?.guidePriorityMode ?? "guide-first",
  };
}

/**
 * ⚠️ 키를 숫자로 바꾸지 말 것 (normalizeOverlayRecord 와 같은 이유).
 *
 * '첫 섹션인가'는 예전엔 Number(key) === 0 으로 판단했는데, 키가 순서가
 * 아니게 되면서 성립하지 않는다. 첫 섹션의 키를 호출부에서 받는다.
 */
export function normalizeSectionOptions(
  record: Record<string, ImageGenOptions>,
  referenceModelUsage: ReferenceModelUsage | null,
  firstSectionKey?: string
) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {} as Record<string, ImageGenOptions>;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, options]) => [
      key,
      normalizeImageOptions(options, referenceModelUsage === "all-sections" ? true : key === firstSectionKey),
    ])
  ) as Record<string, ImageGenOptions>;
}

export function normalizeSectionCopyFields(section: GeneratedResult["blueprint"]["sections"][number]) {
  const { on_image_text: _legacyOnImageText, ...rest } =
    section as GeneratedResult["blueprint"]["sections"][number] & { on_image_text?: string };

  return {
    ...rest,
    headline_en: section.headline_en || section.headline,
    subheadline_en: section.subheadline_en || section.subheadline,
    bullets_en: Array.isArray(section.bullets_en) && section.bullets_en.length ? section.bullets_en : section.bullets,
    trust_or_objection_line_en: section.trust_or_objection_line_en || section.trust_or_objection_line,
    CTA_en: section.CTA_en || section.CTA,
  };
}

export function getLocalizedCopy(korean: string, english: string | undefined, language: PdpCopyLanguage) {
  if (language === "en") {
    return english?.trim() || korean;
  }

  return korean;
}

export function getLocalizedBullets(section: GeneratedResult["blueprint"]["sections"][number], language: PdpCopyLanguage) {
  if (language === "en" && Array.isArray(section.bullets_en) && section.bullets_en.length) {
    return section.bullets_en;
  }

  return section.bullets;
}

export function getDisplaySectionName(section: GeneratedResult["blueprint"]["sections"][number]) {
  if (containsHangul(section.section_name)) {
    return section.section_name;
  }

  const normalized = section.section_name.replace(/^S\d+[_-]?/i, "");
  const tokens = normalized.split(/[_-]+/).filter(Boolean);

  if (!tokens.length) {
    return section.section_name;
  }

  const mappedTokens = tokens.map((token) => translateSectionToken(token));

  if (mappedTokens.length >= 2 && mappedTokens[0] === "베네핏" && /^\d+$/.test(tokens[1] ?? "")) {
    const descriptor = mappedTokens.slice(2).join(" ");
    return descriptor ? `베네핏 ${tokens[1]} · ${descriptor}` : `베네핏 ${tokens[1]}`;
  }

  return mappedTokens.join(" ");
}

export function getDisplaySectionGoal(section: GeneratedResult["blueprint"]["sections"][number]) {
  if (containsHangul(section.goal)) {
    return section.goal;
  }

  if (containsHangul(section.headline)) {
    return section.headline;
  }

  if (containsHangul(section.subheadline)) {
    return section.subheadline;
  }

  return section.goal;
}

export function getModelGenderLabel(gender?: ImageGenOptions["modelGender"]) {
  return gender === "male" ? "남자 모델" : "여자 모델";
}

export function getModelAgeLabel(ageRange?: ImageGenOptions["modelAgeRange"]) {
  if (ageRange === "teen") return "10대 후반";
  if (ageRange === "30s") return "30대";
  if (ageRange === "40s") return "40대";
  if (ageRange === "50s_plus") return "50대+";
  return "20대";
}

export function getModelCountryLabel(country?: ImageGenOptions["modelCountry"]) {
  if (country === "japan") return "일본";
  if (country === "usa") return "미국";
  if (country === "france") return "프랑스";
  if (country === "germany") return "독일";
  if (country === "africa") return "아프리카";
  return "한국";
}

export function containsHangul(value: string) {
  return /[가-힣]/.test(value);
}

export function translateSectionToken(token: string) {
  const normalized = token.trim().toLowerCase();

  if (normalized === "hero") return "히어로";
  if (normalized === "benefit") return "베네핏";
  if (normalized === "evidence") return "근거";
  if (normalized === "review" || normalized === "reviews") return "후기";
  if (normalized === "routine" || normalized === "howto" || normalized === "usage") return "사용법";
  if (normalized === "checklist") return "체크리스트";
  if (normalized === "cta") return "구매 유도";
  if (normalized === "windproof") return "방풍";
  if (normalized === "lightweight") return "경량";
  if (normalized === "style") return "스타일";
  if (normalized === "waterproof") return "방수";
  if (normalized === "comfort") return "편안함";
  if (normalized === "fit") return "핏";

  return /^\d+$/.test(token) ? token : token;
}
