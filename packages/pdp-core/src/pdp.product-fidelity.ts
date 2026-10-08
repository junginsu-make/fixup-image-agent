import type { AnchorRole } from "./pdp.product-anchor";
import type { ProductReading } from "./pdp.product-reading";

/**
 * **첨부한 제품을 섹션마다 같은 제품으로**(설계 2026-10-08 §6·§7).
 *
 * 전에는 제품 규칙이 프롬프트 중간 뒤쪽(`buildReferenceRoleDirective`)에 한 번뿐이었고,
 * Nano Banana Pro 의 시스템 문장에는 제품 말이 아예 없었다. 긴 프롬프트에서 중간
 * 문장은 힘을 잃는다(2026-09-04 실측) — 그래서 앞과 뒤에 한 번씩 더 말한다.
 *
 * **각도는 묶지 않는다**(사용자 결정 D3). 「지킬 것」과 「바꿔도 되는 것」을 늘
 * 한 문단에 둔다 — 「모양 그대로」만 쓰면 모델이 찍힌 각도까지 베낀다.
 */

export interface ProductFacts {
  category?: string;
  visibleFacts: string[];
  labelText: string[];
}

/** 화면·서버·코어가 같은 수를 본다. 두 벌이면 화면이 보낸 것을 서버가 거절한다. */
export const PRODUCT_FACT_LIMITS = { facts: 8, labels: 12, chars: 200 } as const;

/**
 * 판독은 Claude 가 자유롭게 쓴 글이라 줄바꿈이 섞일 수 있다. 그대로 실으면 「- 사실」
 * 목록 밖에 새 줄(지시처럼 읽히는 줄)이 생긴다 — 제어 문자(U+0000–U+001F)와 공백류를
 * 모두 빈칸 하나로 접는다. 정규식 대신 코드 포인트로 거른다(no-control-regex).
 */
const flatten = (text: string) =>
  Array.from(text, (char) => ((char.codePointAt(0) ?? 0) < 0x20 ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
const clip = (value: unknown) =>
  Array.from(flatten(String(value ?? ""))).slice(0, PRODUCT_FACT_LIMITS.chars).join("");
const clipList = (values: unknown, limit: number) =>
  (Array.isArray(values) ? values : []).map(clip).filter(Boolean).slice(0, limit);

/** 판독에서 **제품 자체의 사실**만 뽑는다. 다 비면 없다고 답한다 — 빈 문단은 모델이 채우려 든다. */
export function productFactsFrom(
  reading?: Pick<ProductReading, "category" | "visibleFacts" | "labelText"> | null,
): ProductFacts | undefined {
  if (!reading) return undefined;
  const category = clip(reading.category);
  const visibleFacts = clipList(reading.visibleFacts, PRODUCT_FACT_LIMITS.facts);
  const labelText = clipList(reading.labelText, PRODUCT_FACT_LIMITS.labels);
  if (!category && !visibleFacts.length && !labelText.length) return undefined;
  return { ...(category ? { category } : {}), visibleFacts, labelText };
}

/** `shape-only` 는 사용자가 색·마감을 레퍼런스에 양보한 경우다(`pdp.product-anchor.ts`). */
function keepAndFree(role: AnchorRole) {
  const keepsColour = role !== "shape-only";
  return {
    keep: keepsColour
      ? "silhouette and proportions, defining parts, colour, material and finish, seams and hardware, and every logo and label text on the faces that are visible"
      : "silhouette and proportions, defining parts, seams and hardware, and every logo and label text on the faces that are visible",
    free: keepsColour
      ? "camera angle, distance, crop, background, lighting and where the product sits in the frame"
      : "colour palette, material finish (follow the design reference), camera angle, distance, crop, background, lighting and where the product sits in the frame",
  };
}

function factsBlock(facts: ProductFacts): string[] {
  const lines: string[] = [];
  const items = [...(facts.category ? [`Category: ${facts.category}`] : []), ...facts.visibleFacts];
  if (items.length) {
    lines.push(
      "Product facts read from the photo (about the product itself — ignore anything that describes how the photo was taken, such as its angle or background):",
      ...items.map((item) => `- ${item}`),
    );
  }
  if (facts.labelText.length) {
    lines.push(
      `Label text: ${facts.labelText.map((text) => JSON.stringify(text)).join(", ")}. ` +
        "Render it exactly, but only where that face of the product is visible at the chosen angle. " +
        "Never turn the product just to show the label, and never move the label to another face.",
    );
  }
  if (lines.length) lines.push("If any of this text disagrees with the attached photo, the photo is correct.");
  return lines;
}

export function productFidelityHead(input: {
  imageNumber: number;
  anchorRole: AnchorRole;
  facts?: ProductFacts;
  /** 함께 붙은 인물·캐릭터를 부르는 말. 없으면 그 줄을 안 싣는다. */
  companion?: string;
}): string {
  if (input.anchorRole === "mood-only") return "";
  const { keep, free } = keepAndFree(input.anchorRole);
  return [
    `PRODUCT FIDELITY — Image ${input.imageNumber} is the real product being sold. Reproduce this exact product, not a similar one.`,
    `Keep unchanged: ${keep}.`,
    `Free to change: ${free} — choose these for this section.`,
    "Showing the product from a new angle is expected; changing the product itself is not.",
    ...(input.facts ? factsBlock(input.facts) : []),
    ...(input.companion
      ? [`The product and the ${input.companion} must both be clearly recognisable. Do not shrink, crop or hide one to make room for the other.`]
      : []),
  ].join("\n");
}

export function productFidelityTail(input: { imageNumber: number; anchorRole: AnchorRole }): string {
  if (input.anchorRole === "mood-only") return "";
  const same = input.anchorRole === "shape-only"
    ? "same shape, proportions and label text"
    : "same shape, proportions, colour, material and label text";
  return `Final check: the product in your image must be the exact product in Image ${input.imageNumber} — ${same}. Only the camera, background and lighting may differ.`;
}

export function productFidelitySystemLine(anchorRole: AnchorRole): string {
  if (anchorRole === "mood-only") return "";
  // shape-only 는 사용자가 색·마감을 레퍼런스에 양보했다 — 「그 제품 그대로」라 하면 그 선택을 뒤집는다.
  if (anchorRole === "shape-only") {
    return "The attached product photo is the real product being sold: keep its shape, proportions and label text in every section, let its colour and finish follow the design reference, and choose a fresh camera angle and scene for each one.";
  }
  return "The attached product photo is the real product being sold: reproduce that exact product in every section while choosing a fresh camera angle and scene for each one.";
}
