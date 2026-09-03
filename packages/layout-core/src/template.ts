import type { LayoutSlot, SlotBox, TextStyle } from "./slots";

/**
 * 뼈대 — 카드 한 장의 칸 배열.
 *
 * **칸 순서가 곧 쌓이는 순서다.** 배열 뒤쪽이 위에 그려진다. `background` 를
 * 맨 앞에 두는 것은 관례이지 강제가 아니다 — 그림 위에 띠를 덮는 것도 이
 * 규칙 하나로 된다.
 */
export interface CardTemplate {
  id: string;
  /** 「그림 위 · 글 아래」 */
  name: string;
  /** 어느 자리에 어울리는가. 거르기용이고 강제가 아니다. */
  role: "cover" | "body" | "ending";
  slots: LayoutSlot[];
}

export interface TemplateIssue {
  severity: "error" | "warning";
  message: string;
}

/** 반올림 오차로 멀쩡한 뼈대가 오류가 되지 않게 둔다. */
const EDGE_TOLERANCE = 1e-6;

function outsideCard(box: SlotBox): boolean {
  return box.x < -EDGE_TOLERANCE
    || box.y < -EDGE_TOLERANCE
    || box.x + box.width > 1 + EDGE_TOLERANCE
    || box.y + box.height > 1 + EDGE_TOLERANCE;
}

/** 맞닿기만 한 것은 겹친 것이 아니다. */
function overlaps(first: SlotBox, second: SlotBox): boolean {
  return first.x < second.x + second.width
    && second.x < first.x + first.width
    && first.y < second.y + second.height
    && second.y < first.y + first.height;
}

const SLOT_LABEL: Record<LayoutSlot["kind"], string> = {
  background: "배경",
  image: "그림",
  logo: "로고",
  text: "글",
};

/**
 * 만들기 전에 막는다. 카드를 다 만든 뒤에 알면 돈만 나간다.
 *
 * 겹침은 **글 칸끼리만** 따진다. 배경 위의 글, 그림 위의 띠는 이 뼈대가
 * 노리는 것이라 오류로 볼 수 없다.
 */
export function validateTemplate(template: CardTemplate): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  if (template.slots.length === 0) {
    return [{ severity: "error", message: "칸이 하나도 없습니다. 칸을 하나 이상 두세요." }];
  }

  template.slots.forEach((slot, offset) => {
    const where = `${offset + 1}번 ${SLOT_LABEL[slot.kind]} 칸`;
    if (slot.box.width <= 0 || slot.box.height <= 0) {
      issues.push({ severity: "error", message: `${where}의 넓이나 높이가 0입니다.` });
      return;
    }
    if (outsideCard(slot.box)) {
      issues.push({ severity: "error", message: `${where}이 카드 밖으로 나갑니다.` });
    }
  });

  const texts = template.slots.flatMap((slot, offset) => (slot.kind === "text" ? [{ slot, offset }] : []));
  for (let first = 0; first < texts.length; first += 1) {
    for (let second = first + 1; second < texts.length; second += 1) {
      if (!overlaps(texts[first]!.slot.box, texts[second]!.slot.box)) continue;
      issues.push({
        severity: "warning",
        message: `${texts[first]!.offset + 1}번과 ${texts[second]!.offset + 1}번 글 칸이 겹칩니다. 글자가 서로 위에 찍힙니다.`,
      });
    }
  }
  return issues;
}

/** 동봉한 서체. 없으면 fontconfig 가 대신 고른다. */
export const DEFAULT_FONT_FAMILY = "Pretendard";

const HEADLINE: TextStyle = {
  family: DEFAULT_FONT_FAMILY,
  weight: 700,
  sizeRatio: 0.3,
  lineHeight: 1.25,
  color: "#111111",
  align: "left",
  valign: "top",
};

const BODY: TextStyle = {
  family: DEFAULT_FONT_FAMILY,
  weight: 400,
  sizeRatio: 0.16,
  lineHeight: 1.5,
  color: "#333333",
  align: "left",
  valign: "top",
};

const ACCENT: TextStyle = {
  family: DEFAULT_FONT_FAMILY,
  weight: 700,
  sizeRatio: 0.62,
  lineHeight: 1.2,
  color: "#2563EB",
  align: "left",
  valign: "middle",
};

const FOOTNOTE: TextStyle = {
  family: DEFAULT_FONT_FAMILY,
  weight: 400,
  sizeRatio: 0.5,
  lineHeight: 1.3,
  color: "#777777",
  align: "left",
  valign: "bottom",
};

function styled(base: TextStyle, patch: Partial<TextStyle>): TextStyle {
  return { ...base, ...patch };
}

function background(fill: string): LayoutSlot {
  return { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill };
}

/**
 * 코드에 있는 목록. 표에 넣지 않는다.
 *
 * 코드에 있는 것을 DB 에도 두면 둘이 어긋나는 날이 온다. 표에는 사람이
 * 「이 뼈대 저장하기」를 누른 것만 들어간다.
 */
export const DEFAULT_TEMPLATES: CardTemplate[] = [
  {
    id: "cover-image-top",
    name: "표지 · 그림 위, 제목 아래",
    role: "cover",
    slots: [
      background("#FFFFFF"),
      { kind: "image", box: { x: 0, y: 0, width: 1, height: 0.62 } },
      { kind: "text", box: { x: 0.08, y: 0.68, width: 0.84, height: 0.16 }, source: { from: "copy", field: "headline" }, style: HEADLINE },
      { kind: "text", box: { x: 0.08, y: 0.85, width: 0.84, height: 0.08 }, source: { from: "copy", field: "body" }, style: styled(BODY, { sizeRatio: 0.32 }) },
    ],
  },
  {
    id: "cover-band",
    name: "표지 · 전면 그림에 아래 띠",
    role: "cover",
    slots: [
      { kind: "image", box: { x: 0, y: 0, width: 1, height: 1 } },
      { kind: "background", box: { x: 0, y: 0.62, width: 1, height: 0.38 }, fill: "#0F172A" },
      { kind: "text", box: { x: 0.08, y: 0.68, width: 0.84, height: 0.18 }, source: { from: "copy", field: "headline" }, style: styled(HEADLINE, { color: "#FFFFFF" }) },
      { kind: "text", box: { x: 0.08, y: 0.88, width: 0.84, height: 0.06 }, source: { from: "copy", field: "body" }, style: styled(BODY, { color: "#E2E8F0", sizeRatio: 0.42 }) },
    ],
  },
  {
    id: "cover-title-first",
    name: "표지 · 제목이 크고 그림은 아래",
    role: "cover",
    slots: [
      background("#0F172A"),
      { kind: "text", box: { x: 0.08, y: 0.13, width: 0.84, height: 0.05 }, source: { from: "copy", field: "accent" }, style: ACCENT },
      { kind: "text", box: { x: 0.08, y: 0.22, width: 0.84, height: 0.32 }, source: { from: "copy", field: "headline" }, style: styled(HEADLINE, { color: "#FFFFFF", sizeRatio: 0.22 }) },
      { kind: "image", box: { x: 0.08, y: 0.6, width: 0.84, height: 0.32 } },
    ],
  },
  {
    id: "body-image-top",
    name: "속지 · 그림 위, 글 아래",
    role: "body",
    slots: [
      background("#FFFFFF"),
      { kind: "image", box: { x: 0, y: 0, width: 1, height: 0.5 } },
      { kind: "text", box: { x: 0.08, y: 0.56, width: 0.84, height: 0.13 }, source: { from: "copy", field: "headline" }, style: styled(HEADLINE, { sizeRatio: 0.34 }) },
      { kind: "text", box: { x: 0.08, y: 0.71, width: 0.84, height: 0.22 }, source: { from: "copy", field: "body" }, style: BODY },
    ],
  },
  {
    id: "body-text-top",
    name: "속지 · 글 위, 그림 아래",
    role: "body",
    slots: [
      background("#FFFFFF"),
      { kind: "text", box: { x: 0.08, y: 0.08, width: 0.84, height: 0.13 }, source: { from: "copy", field: "headline" }, style: styled(HEADLINE, { sizeRatio: 0.34 }) },
      { kind: "text", box: { x: 0.08, y: 0.23, width: 0.84, height: 0.17 }, source: { from: "copy", field: "body" }, style: BODY },
      { kind: "image", box: { x: 0, y: 0.44, width: 1, height: 0.56 } },
    ],
  },
  {
    id: "body-side-by-side",
    name: "속지 · 왼쪽 글, 오른쪽 그림",
    role: "body",
    slots: [
      background("#FFFFFF"),
      { kind: "text", box: { x: 0.06, y: 0.14, width: 0.42, height: 0.16 }, source: { from: "copy", field: "headline" }, style: styled(HEADLINE, { sizeRatio: 0.28 }) },
      { kind: "text", box: { x: 0.06, y: 0.33, width: 0.42, height: 0.4 }, source: { from: "copy", field: "body" }, style: styled(BODY, { sizeRatio: 0.09 }) },
      { kind: "image", box: { x: 0.54, y: 0.14, width: 0.4, height: 0.59 } },
    ],
  },
  {
    id: "body-text-only",
    name: "속지 · 글만",
    role: "body",
    slots: [
      background("#F8FAFC"),
      { kind: "text", box: { x: 0.09, y: 0.16, width: 0.82, height: 0.06 }, source: { from: "copy", field: "accent" }, style: ACCENT },
      { kind: "text", box: { x: 0.09, y: 0.26, width: 0.82, height: 0.24 }, source: { from: "copy", field: "headline" }, style: styled(HEADLINE, { sizeRatio: 0.26 }) },
      { kind: "text", box: { x: 0.09, y: 0.54, width: 0.82, height: 0.3 }, source: { from: "copy", field: "body" }, style: styled(BODY, { sizeRatio: 0.12 }) },
      { kind: "text", box: { x: 0.09, y: 0.87, width: 0.82, height: 0.05 }, source: { from: "copy", field: "footnote" }, style: FOOTNOTE },
    ],
  },
  {
    id: "ending-message",
    name: "엔딩 · 가운데 문구",
    role: "ending",
    slots: [
      background("#0F172A"),
      { kind: "text", box: { x: 0.1, y: 0.3, width: 0.8, height: 0.2 }, source: { from: "copy", field: "headline" }, style: styled(HEADLINE, { color: "#FFFFFF", align: "center", valign: "bottom", sizeRatio: 0.28 }) },
      { kind: "text", box: { x: 0.1, y: 0.53, width: 0.8, height: 0.12 }, source: { from: "copy", field: "body" }, style: styled(BODY, { color: "#CBD5F5", align: "center", sizeRatio: 0.24 }) },
    ],
  },
  {
    id: "ending-logo",
    name: "엔딩 · 문구와 로고",
    role: "ending",
    slots: [
      background("#FFFFFF"),
      { kind: "text", box: { x: 0.1, y: 0.28, width: 0.8, height: 0.2 }, source: { from: "copy", field: "headline" }, style: styled(HEADLINE, { align: "center", valign: "bottom", sizeRatio: 0.28 }) },
      { kind: "text", box: { x: 0.1, y: 0.51, width: 0.8, height: 0.12 }, source: { from: "copy", field: "body" }, style: styled(BODY, { align: "center", sizeRatio: 0.24 }) },
      { kind: "logo", box: { x: 0.35, y: 0.7, width: 0.3, height: 0.12 }, referenceImageId: "", fit: "contain" },
    ],
  },
];

export function templatesForRole(role: CardTemplate["role"]): CardTemplate[] {
  return DEFAULT_TEMPLATES.filter((template) => template.role === role);
}

/** 고르지 않고 넘어갔을 때 쓸 뼈대. */
export function defaultTemplateForRole(role: CardTemplate["role"]): CardTemplate {
  const found = templatesForRole(role)[0];
  if (!found) throw new Error(`${role} 자리에 쓸 기본 뼈대가 없습니다.`);
  return found;
}

export function templateById(id: string): CardTemplate | undefined {
  return DEFAULT_TEMPLATES.find((template) => template.id === id);
}
