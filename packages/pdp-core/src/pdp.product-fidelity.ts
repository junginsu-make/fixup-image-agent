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

/**
 * 제품 하나의 첨부 번호 묶음(설계 §6.1). 첨부 배열에서 만든다(`fidelityGroups`) — 번호를 따로 세면
 * 이름표와 어긋난다. `label` 은 제품이 여럿일 때만 쓴다.
 */
export interface FidelityGroup {
  label?: string;
  imageNumbers: number[];
  facts?: ProductFacts;
}

/** `Image 3` · `Images 1–2`. 한 제품의 사진은 붙어서 담기지만, 안 붙었으면 번호를 다 적는다. */
function imagesPhrase(numbers: readonly number[]): string {
  if (numbers.length === 1) return `Image ${numbers[0]}`;
  const first = numbers[0]!;
  const last = numbers[numbers.length - 1]!;
  return last - first === numbers.length - 1 ? `Images ${first}–${last}` : `Images ${numbers.join(", ")}`;
}

/**
 * 앞 문장. 제품 하나·사진 하나는 1·2단계 문장 그대로다(회귀 고정 — `pdp.single-product-lock.test.ts`).
 * 제품이 여럿이면 제품마다 번호 줄을 두고 그 아래에 그 제품의 사실을 둔다 — 다른 제품의
 * 사실로 읽히지 않게.
 */
function headOpening(groups: readonly FidelityGroup[]): string[] {
  if (groups.length === 1) {
    const only = groups[0]!;
    const opening = only.imageNumbers.length === 1
      ? `PRODUCT FIDELITY — ${imagesPhrase(only.imageNumbers)} is the real product being sold.`
      : `PRODUCT FIDELITY — ${imagesPhrase(only.imageNumbers)} show the real product being sold — one product photographed from several angles.`;
    return [`${opening} Reproduce this exact product, not a similar one.`];
  }
  return [
    "PRODUCT FIDELITY — The attached product photos show the real products being sold. Reproduce each exact product, not a similar one.",
    ...groups.flatMap((group) => [
      `${group.label ?? "PRODUCT"} — ${imagesPhrase(group.imageNumbers)}`,
      ...(group.facts ? factsBlock(group.facts) : []),
    ]),
    // 여럿을 한 장에 그리면 모델이 특징을 섞거나 하나로 합친다. 없는 제품을 더하는 것도 막는다.
    "These are different products. Do not blend their features or merge them into one; draw each from its own photos. Do not add any product that is not attached.",
  ];
}

export function productFidelityHead(input: {
  groups: readonly FidelityGroup[];
  anchorRole: AnchorRole;
  /** 함께 붙은 인물·캐릭터를 부르는 말. 없으면 그 줄을 안 싣는다. */
  companion?: string;
}): string {
  if (input.anchorRole === "mood-only" || input.groups.length === 0) return "";
  const { keep, free } = keepAndFree(input.anchorRole);
  const single = input.groups.length === 1 ? input.groups[0] : undefined;
  const subject = single ? "The product" : "The products";
  return [
    ...headOpening(input.groups),
    `Keep unchanged: ${keep}.`,
    `Free to change: ${free} — choose these for this section.`,
    "Showing the product from a new angle is expected; changing the product itself is not.",
    // 제품이 하나면 사실은 지금 자리(이 아래)다. 여럿이면 제품 줄 아래에 이미 실었다.
    ...(single?.facts ? factsBlock(single.facts) : []),
    ...(input.companion
      ? [`${subject} and the ${input.companion} must ${single ? "both" : "all"} be clearly recognisable. Do not shrink, crop or hide one to make room for the other.`]
      : []),
  ].join("\n");
}

export function productFidelityTail(input: { groups: readonly FidelityGroup[]; anchorRole: AnchorRole }): string {
  if (input.anchorRole === "mood-only" || input.groups.length === 0) return "";
  const same = input.anchorRole === "shape-only"
    ? "same shape, proportions and label text"
    : "same shape, proportions, colour, material and label text";
  if (input.groups.length === 1) {
    return `Final check: the product in your image must be the exact product in ${imagesPhrase(input.groups[0]!.imageNumbers)} — ${same}. Only the camera, background and lighting may differ.`;
  }
  const own = input.groups
    .map((group) => `${group.label ?? "PRODUCT"}: ${imagesPhrase(group.imageNumbers)}`)
    .join("; ");
  return `Final check: each product must be the exact product in its own images (${own}) — ${same}. Only the camera, background and lighting may differ.`;
}

export function productFidelitySystemLine(anchorRole: AnchorRole): string {
  if (anchorRole === "mood-only") return "";
  // shape-only 는 사용자가 색·마감을 레퍼런스에 양보했다 — 「그 제품 그대로」라 하면 그 선택을 뒤집는다.
  if (anchorRole === "shape-only") {
    return "The attached product photo is the real product being sold: keep its shape, proportions and label text in every section, let its colour and finish follow the design reference, and choose a fresh camera angle and scene for each one.";
  }
  return "The attached product photo is the real product being sold: reproduce that exact product in every section while choosing a fresh camera angle and scene for each one.";
}
