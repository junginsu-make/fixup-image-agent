import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error sharp 0.35.0 은 exports 에 types 조건이 없다. 런타임 export 는 정상.
import sharp from "sharp";
import type { CardCopy } from "@fixup/sns-core";
import type { LayoutSlot } from "@fixup/layout-core";
import { composeCard } from "../compose";

const CARD = { width: 544, height: 680 };
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

const COPY: CardCopy = {
  index: 1,
  headline: "레이아웃을 먼저 정한다",
  body: "글은 우리가 그리고, 그림만 모델에게 맡긴다.",
};

const STYLE = {
  family: "Pretendard",
  weight: 700 as const,
  sizeRatio: 0.3,
  lineHeight: 1.3,
  color: "#111111",
  align: "left" as const,
  valign: "top" as const,
};

function textSlot(patch: Partial<Extract<LayoutSlot, { kind: "text" }>> = {}): LayoutSlot {
  return {
    kind: "text",
    box: { x: 0.08, y: 0.6, width: 0.84, height: 0.16 },
    source: { from: "copy", field: "headline" },
    style: STYLE,
    ...patch,
  };
}

async function solid(width: number, height: number, colour: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: colour } }).png().toBuffer();
}

const FOUR_SLOTS: LayoutSlot[] = [
  { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" },
  { kind: "image", box: { x: 0, y: 0, width: 1, height: 0.5 } },
  textSlot(),
  textSlot({ box: { x: 0.08, y: 0.8, width: 0.84, height: 0.12 }, source: { from: "copy", field: "body" } }),
];

describe("composeCard", () => {
  it("네 칸 뼈대로 요청한 크기의 PNG 가 나온다", async () => {
    const result = await composeCard({
      size: CARD,
      slots: FOUR_SLOTS,
      copy: COPY,
      images: { 1: await solid(544, 340, "#3366ff") },
      fontDir: FONT_DIR,
    });

    const meta = await sharp(result.png).metadata();
    expect(meta.format).toBe("png");
    expect({ width: meta.width, height: meta.height }).toEqual(CARD);
    expect(result.warnings).toEqual([]);
  });

  it("그림이 안 온 칸은 회색으로 두고 카드는 만든다", async () => {
    const result = await composeCard({ size: CARD, slots: FOUR_SLOTS, copy: COPY, fontDir: FONT_DIR });

    const meta = await sharp(result.png).metadata();
    expect(meta.width).toBe(CARD.width);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("그림");
  });

  it("뼈대 미리보기에서는 그림이 없어도 알리지 않는다", async () => {
    const result = await composeCard({ size: CARD, slots: FOUR_SLOTS, copy: COPY, preview: true, fontDir: FONT_DIR });

    expect(result.warnings).toEqual([]);
  });

  it("원고에 없는 글 칸은 빈 상자도 그리지 않는다", async () => {
    const withEmpty = await composeCard({
      size: CARD,
      slots: [FOUR_SLOTS[0]!, textSlot({ source: { from: "copy", field: "footnote" } })],
      copy: COPY,
      fontDir: FONT_DIR,
    });
    const withoutSlot = await composeCard({
      size: CARD,
      slots: [FOUR_SLOTS[0]!],
      copy: COPY,
      fontDir: FONT_DIR,
    });

    expect(withEmpty.png.equals(withoutSlot.png)).toBe(true);
  });

  it("고정 문구는 원고가 없어도 그린다", async () => {
    const fixed = await composeCard({
      size: CARD,
      slots: [FOUR_SLOTS[0]!, textSlot({ source: { from: "fixed", text: "자세히 보기" } })],
      copy: COPY,
      fontDir: FONT_DIR,
    });
    const bare = await composeCard({ size: CARD, slots: [FOUR_SLOTS[0]!], copy: COPY, fontDir: FONT_DIR });

    expect(fixed.png.equals(bare.png)).toBe(false);
  });

  it("좁은 칸에 긴 글이 오면 줄여 넣고, 그래도 넘치면 알린다", async () => {
    const long = "가".repeat(400);
    const result = await composeCard({
      size: CARD,
      slots: [FOUR_SLOTS[0]!, textSlot({ box: { x: 0.1, y: 0.1, width: 0.3, height: 0.05 }, source: { from: "fixed", text: long } })],
      copy: COPY,
      fontDir: FONT_DIR,
    });

    expect(result.warnings.join(" ")).toContain("넘칩니다");
  });

  it("로고 그림이 없으면 그 칸을 비우고 카드는 만든다", async () => {
    const result = await composeCard({
      size: CARD,
      slots: [
        FOUR_SLOTS[0]!,
        { kind: "logo", box: { x: 0.35, y: 0.7, width: 0.3, height: 0.12 }, referenceImageId: "", fit: "contain" },
      ],
      copy: COPY,
      fontDir: FONT_DIR,
    });

    const meta = await sharp(result.png).metadata();
    expect(meta.width).toBe(CARD.width);
    expect(result.warnings.join(" ")).toContain("로고");
  });

  it("로고는 잘리지 않고 칸 안에 통째로 들어간다", async () => {
    const result = await composeCard({
      size: CARD,
      slots: [
        { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" },
        { kind: "logo", box: { x: 0, y: 0, width: 1, height: 0.2 }, referenceImageId: "logo-1", fit: "contain" },
      ],
      copy: COPY,
      logos: { 1: await solid(200, 200, "#ff0000") },
      fontDir: FONT_DIR,
    });

    // 544×136 칸에 정사각 로고 → 136×136 이 가운데. 왼쪽 위 구석은 배경 그대로다.
    const raw = await sharp(result.png).removeAlpha().raw().toBuffer();
    expect([raw[0], raw[1], raw[2]]).toEqual([255, 255, 255]);
    const centre = (68 * CARD.width + 272) * 3;
    expect([raw[centre], raw[centre + 1], raw[centre + 2]]).toEqual([255, 0, 0]);
    expect(result.warnings).toEqual([]);
  });

  it("칸 배열 뒤쪽이 위에 그려진다", async () => {
    const result = await composeCard({
      size: CARD,
      slots: [
        { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" },
        { kind: "background", box: { x: 0, y: 0, width: 1, height: 0.5 }, fill: "#000000" },
      ],
      copy: COPY,
      fontDir: FONT_DIR,
    });

    const raw = await sharp(result.png).removeAlpha().raw().toBuffer();
    expect([raw[0], raw[1], raw[2]]).toEqual([0, 0, 0]);
  });

  // 원칙 하나 — 카드는 나온다. 한 칸 때문에 열 장을 못 만들면 안 된다.
  it("배경 색이 잘못돼도 그 칸만 건너뛰고 카드는 만든다", async () => {
    const result = await composeCard({
      size: CARD,
      slots: [
        FOUR_SLOTS[0]!,
        { kind: "background", box: { x: 0, y: 0.5, width: 1, height: 0.5 }, fill: "짙은 남색" },
      ],
      copy: COPY,
      fontDir: FONT_DIR,
    });

    const meta = await sharp(result.png).metadata();
    expect(meta.width).toBe(CARD.width);
    expect(result.warnings.join(" ")).toContain("배경");
  });

  it("글꼴 이름으로 폰트 폴더 밖을 뒤지지 못한다", async () => {
    const result = await composeCard({
      size: CARD,
      slots: [
        FOUR_SLOTS[0]!,
        textSlot({ style: { ...STYLE, family: "../../../../../../Windows/Fonts/malgun" } }),
      ],
      copy: COPY,
      fontDir: FONT_DIR,
    });

    const meta = await sharp(result.png).metadata();
    expect(meta.width).toBe(CARD.width);
    expect(result.warnings.join(" ")).toContain("글꼴 이름");
  });

  // 눈에 안 보이는 글자만 든 칸은 빈 칸이다. 그대로 sharp 에 보내면
  // "text: no text to render" 라는 영문 오류가 사람 화면에 뜬다.
  it("보이지 않는 글자만 있는 칸은 빈 칸으로 본다", async () => {
    const invisible = await composeCard({
      size: CARD,
      slots: [FOUR_SLOTS[0]!, textSlot({ source: { from: "fixed", text: "​​" } })],
      copy: COPY,
      fontDir: FONT_DIR,
    });
    const bare = await composeCard({ size: CARD, slots: [FOUR_SLOTS[0]!], copy: COPY, fontDir: FONT_DIR });

    expect(invisible.warnings).toEqual([]);
    expect(invisible.png.equals(bare.png)).toBe(true);
  });

  /**
   * 크기만 보면 그림이 엉뚱한 자리에 붙어도 통과한다. 칸을 정해 두는 것이
   * 이 기능의 전부이므로, 그림이 **그 칸에만** 들어갔는지 실제 화소로 본다.
   *
   * 칸을 일부러 원점에서 떨어뜨린다. (0,0)에서 시작하는 칸으로 시험하면
   * 자리를 통째로 무시해도 그대로 통과한다 — 실제로 그랬다.
   */
  it("그림은 자기 칸에만 들어가고 칸 밖은 건드리지 않는다", async () => {
    // 544×680 카드에서 x 0.25~0.75, y 0.5~0.9 → 왼쪽 136, 위 340, 272×272
    const result = await composeCard({
      size: CARD,
      slots: [
        { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" },
        { kind: "image", box: { x: 0.25, y: 0.5, width: 0.5, height: 0.4 } },
      ],
      copy: COPY,
      images: { 1: await solid(272, 272, "#FF0000") },
      fontDir: FONT_DIR,
    });

    const raw = await sharp(result.png).removeAlpha().raw().toBuffer();
    const at = (x: number, y: number) => [raw[(y * CARD.width + x) * 3], raw[(y * CARD.width + x) * 3 + 1], raw[(y * CARD.width + x) * 3 + 2]];

    // 칸 네 귀퉁이는 그림이다.
    expect(at(136, 340)).toEqual([255, 0, 0]);
    expect(at(407, 340)).toEqual([255, 0, 0]);
    expect(at(136, 611)).toEqual([255, 0, 0]);
    expect(at(407, 611)).toEqual([255, 0, 0]);

    // 사방 한 칸 밖은 배경 그대로다.
    expect(at(135, 340)).toEqual([255, 255, 255]);
    expect(at(408, 340)).toEqual([255, 255, 255]);
    expect(at(136, 339)).toEqual([255, 255, 255]);
    expect(at(136, 612)).toEqual([255, 255, 255]);
    expect(at(0, 0)).toEqual([255, 255, 255]);
  });

  it("칸이 하나도 없어도 요청한 크기의 흰 카드가 나온다", async () => {
    const result = await composeCard({ size: CARD, slots: [], copy: COPY, fontDir: FONT_DIR });

    const meta = await sharp(result.png).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual(CARD);
    expect(result.warnings).toEqual([]);
  });
});
