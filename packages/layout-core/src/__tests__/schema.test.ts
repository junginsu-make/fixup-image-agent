import { describe, expect, it } from "vitest";
import {
  CardTemplateSchema,
  MAX_TEMPLATE_SLOTS,
  MAX_TEXT_SLOTS,
  LayoutDeckSchema,
  LayoutSlotSchema,
  parseStoredFrames,
  parseStoredSlots,
} from "../schema";

const BOX = { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };

const STYLE = {
  family: "Pretendard",
  weight: 700,
  sizeRatio: 0.3,
  lineHeight: 1.3,
  color: "#111111",
  align: "left",
  valign: "top",
};

describe("LayoutSlotSchema", () => {
  it("네 종류를 그대로 받는다", () => {
    const slots = [
      { kind: "background", box: BOX, fill: "#FFFFFF" },
      { kind: "image", box: BOX, brief: "책상 위 노트북" },
      { kind: "logo", box: BOX, referenceImageId: "ref-1", fit: "contain" },
      { kind: "text", box: BOX, source: { from: "copy", field: "headline" }, style: STYLE },
    ];

    for (const slot of slots) expect(LayoutSlotSchema.safeParse(slot).success).toBe(true);
  });

  it("모르는 종류는 거절한다", () => {
    expect(LayoutSlotSchema.safeParse({ kind: "qrcode", box: BOX }).success).toBe(false);
  });

  it("0~1 밖 좌표는 거절한다", () => {
    expect(LayoutSlotSchema.safeParse({ kind: "image", box: { ...BOX, x: 1.4 } }).success).toBe(false);
    expect(LayoutSlotSchema.safeParse({ kind: "image", box: { ...BOX, width: 0 } }).success).toBe(false);
  });

  it("hex 가 아닌 색은 거절한다", () => {
    expect(LayoutSlotSchema.safeParse({ kind: "background", box: BOX, fill: "white" }).success).toBe(false);
  });

  it("아는 굵기만 받는다", () => {
    const odd = { kind: "text", box: BOX, source: { from: "copy", field: "headline" }, style: { ...STYLE, weight: 350 } };

    expect(LayoutSlotSchema.safeParse(odd).success).toBe(false);
  });

  it("글꼴 이름에 경로 문자를 못 넣는다", () => {
    const escape = { kind: "text", box: BOX, source: { from: "copy", field: "headline" },
                     style: { ...STYLE, family: "../../../../etc/passwd" } };
    const fine = { ...escape, style: { ...STYLE, family: "Pretendard" } };

    expect(LayoutSlotSchema.safeParse(escape).success).toBe(false);
    expect(LayoutSlotSchema.safeParse(fine).success).toBe(true);
  });

  it("글자 크기가 칸 높이의 두 배를 넘으면 거절한다", () => {
    const huge = { kind: "text", box: BOX, source: { from: "copy", field: "headline" },
                   style: { ...STYLE, sizeRatio: 2.5 } };

    expect(LayoutSlotSchema.safeParse(huge).success).toBe(false);
  });

  it("고정 문구가 너무 길면 거절한다", () => {
    const long = { kind: "text", box: BOX, source: { from: "fixed", text: "가".repeat(501) }, style: STYLE };

    expect(LayoutSlotSchema.safeParse(long).success).toBe(false);
  });

  it("고정 문구 칸도 받는다", () => {
    const fixed = { kind: "text", box: BOX, source: { from: "fixed", text: "자세히 보기" }, style: STYLE };

    expect(LayoutSlotSchema.safeParse(fixed).success).toBe(true);
  });
});

describe("CardTemplateSchema", () => {
  it("칸이 하나도 없는 뼈대는 거절한다", () => {
    expect(CardTemplateSchema.safeParse({ id: "t", name: "빈 것", role: "body", slots: [] }).success).toBe(false);
  });

  it("모르는 역할은 거절한다", () => {
    const wrong = { id: "t", name: "이름", role: "middle", slots: [{ kind: "image", box: BOX }] };

    expect(CardTemplateSchema.safeParse(wrong).success).toBe(false);
  });

  // 글 칸 하나가 렌더 여러 번이다. 개수 상한이 없으면 요청 하나로 서버를 묶는다.
  it("글 칸이 상한을 넘으면 거절한다", () => {
    const textSlot = { kind: "text", box: BOX, source: { from: "copy", field: "headline" }, style: STYLE };
    const wordy = { id: "t", name: "이름", role: "body", slots: Array.from({ length: MAX_TEXT_SLOTS + 1 }, () => textSlot) };
    const fine = { ...wordy, slots: Array.from({ length: MAX_TEXT_SLOTS }, () => textSlot) };

    expect(CardTemplateSchema.safeParse(wordy).success).toBe(false);
    expect(CardTemplateSchema.safeParse(fine).success).toBe(true);
  });

  it("칸이 상한을 넘으면 거절한다", () => {
    const many = {
      id: "t",
      name: "이름",
      role: "body",
      slots: Array.from({ length: MAX_TEMPLATE_SLOTS + 1 }, () => ({ kind: "image", box: BOX })),
    };

    expect(CardTemplateSchema.safeParse(many).success).toBe(false);
  });
});

describe("LayoutDeckSchema", () => {
  const frame = [{ kind: "image", box: BOX }];
  const deck = { name: "기본 세트", ratio: "4:5", total: 6, frames: { cover: frame, body: frame, ending: frame } };

  it("제대로 된 세트를 받는다", () => {
    expect(LayoutDeckSchema.safeParse(deck).success).toBe(true);
  });

  it("자리 하나가 비면 거절한다", () => {
    expect(LayoutDeckSchema.safeParse({ ...deck, frames: { ...deck.frames, body: [] } }).success).toBe(false);
  });

  it("만들 수 있는 장수를 벗어나면 거절한다", () => {
    for (const total of [3, 9, 6.5]) {
      expect(LayoutDeckSchema.safeParse({ ...deck, total }).success).toBe(false);
    }
  });

  it("한 자리의 글 칸도 같은 상한을 지킨다", () => {
    const textSlot = { kind: "text", box: BOX, source: { from: "copy", field: "headline" }, style: STYLE };
    const wordy = { ...deck, frames: { ...deck.frames, body: Array.from({ length: MAX_TEXT_SLOTS + 1 }, () => textSlot) } };

    expect(LayoutDeckSchema.safeParse(wordy).success).toBe(false);
  });

  it("자리가 셋 다 있어야 한다", () => {
    expect(LayoutDeckSchema.safeParse({ ...deck, frames: { cover: frame, body: frame } }).success).toBe(false);
  });
});

describe("표에서 읽은 값 되검사", () => {
  const good = [{ kind: "image", box: BOX }];
  const bad = [{ kind: "image", box: { ...BOX, x: 9 } }];

  it("규칙에 맞는 칸 목록은 그대로 돌려준다", () => {
    expect(parseStoredSlots(good)).toHaveLength(1);
  });

  it("규칙에 어긋난 칸 목록은 버린다", () => {
    // 회원은 브라우저에서 PostgREST 로 직접 써서 zod 를 건너뛸 수 있다.
    // 읽을 때 안 보면 그 값이 합성까지 그대로 흘러간다.
    expect(parseStoredSlots(bad)).toBeUndefined();
    expect(parseStoredSlots("칸 아님")).toBeUndefined();
  });

  it("세 자리가 다 성해야 세트로 인정한다", () => {
    expect(parseStoredFrames({ cover: good, body: good, ending: good })).toBeDefined();
    expect(parseStoredFrames({ cover: good, body: bad, ending: good })).toBeUndefined();
    expect(parseStoredFrames({ cover: good, body: good })).toBeUndefined();
  });
});
