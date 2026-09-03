import { describe, expect, it } from "vitest";
import { buildPosterPrompt } from "../prompt";
import { EMPTY_SLOTS } from "../schemas";

const slots = {
  ...EMPTY_SLOTS,
  kind: "전시 홍보",
  headline: "가을, 셔터를 누르다",
  subline: "필름으로 담은 도시의 온도",
  sideTexts: ["28MM F2.0", "ISO 400"],
  scene: "해질녘 골목",
  subject: "필름 카메라를 든 20대 여성",
  action: "셔터를 누르는 순간",
  typeInteraction: "통과" as const,
  dominantColor: "따뜻한 세피아",
  accentColor: "선명한 주황",
  forbidden: "로고, 워터마크",
};

const images = [
  { kind: "style_reference" as const, title: "SNAP" },
  { kind: "preserved" as const, title: "제품 사진" },
];

const size = { width: 1024, height: 1536 };

describe("레퍼런스는 꼴만 가져온다", () => {
  const only = buildPosterPrompt({ slots, images: [{ kind: "style_reference" }], size });

  it("레퍼런스 안의 것은 가져오지 말라고 못 박는다", () => {
    // 안 적으면 모델이 레퍼런스의 아이콘·제품·글자를 통째로 베낀다.
    expect(only).toMatch(/Do NOT copy/i);
    expect(only).toMatch(/icons|illustrations/i);
  });

  it("아이콘은 같은 양식으로 새로 그리라고 한다", () => {
    expect(only).toMatch(/Draw new|same style/i);
  });

  it("색을 어디에 쓰는지까지 말한다", () => {
    expect(only).toMatch(/how each colour is used|fill surfaces/i);
  });
});

describe("지키는 대상이 사람인지 물건인지 가른다", () => {
  // 실측 정책(pdp.reference-policy.ts): 얼굴이 둘이면 모델이 절충해 제3의
  // 인물을 만든다. 물건과 사람을 같은 문장으로 지키라고 하면 그 경고를 할
  // 자리가 없다.
  const person = buildPosterPrompt({
    slots,
    images: [{ kind: "preserved", subject: "person", title: "모델" }],
    size,
  });
  const product = buildPosterPrompt({
    slots,
    images: [{ kind: "preserved", subject: "object", title: "제품" }],
    size,
  });

  it("사람에게는 얼굴과 체형을 지키라고 한다", () => {
    expect(person).toMatch(/facial features|face/i);
  });

  it("물건에게는 라벨과 재질을 지키라고 한다", () => {
    expect(product).toMatch(/labels/i);
    expect(product).not.toMatch(/facial features/i);
  });

  it("얼굴이 둘이면 하나만 쓰라고 못 박는다", () => {
    const twoFaces = buildPosterPrompt({
      slots,
      images: [
        { kind: "preserved", subject: "person", title: "모델 A" },
        { kind: "preserved", subject: "person", title: "모델 B" },
      ],
      size,
    });
    expect(twoFaces).toMatch(/only one person|single person/i);
  });

  it("대상을 안 적으면 물건으로 다룬다", () => {
    // 옛 자료에는 대상이 없다. 사람으로 보면 없는 얼굴을 지키려 든다.
    const legacy = buildPosterPrompt({ slots, images: [{ kind: "preserved", title: "무엇" }], size });
    expect(legacy).not.toMatch(/facial features/i);
  });
});

describe("포스터 프롬프트", () => {
  const prompt = buildPosterPrompt({ slots, images, size });

  it("첨부마다 역할을 번호로 알려준다", () => {
    expect(prompt).toMatch(/Image 1 is[\s\S]*REFERENCE/);
    expect(prompt).toMatch(/Image 2 is[\s\S]*PRESERVED/);
  });

  it("보존 대상이 스타일보다 우선한다", () => {
    const priority = prompt.slice(prompt.indexOf("Priority"));
    expect(priority.indexOf("PRESERVED")).toBeLessThan(priority.indexOf("REFERENCE"));
  });

  it("이전 결과를 붙이지 않는다 — 앵커가 없다", () => {
    expect(prompt).not.toMatch(/same series/i);
    expect(prompt).not.toMatch(/Only the content differs/i);
    expect(prompt).not.toMatch(/previous/i);
  });

  it("비어 있지 않은 글자 칸마다 자리를 준다", () => {
    for (const value of ["가을, 셔터를 누르다", "필름으로 담은 도시의 온도", "28MM F2.0", "ISO 400"]) {
      expect(prompt).toContain(value);
    }
  });

  it("길면 줄이지 말고 작게 넣으라고 한다", () => {
    expect(prompt).toMatch(/smaller font|more lines/i);
    expect(prompt).toMatch(/Do not omit|do not shorten/i);
  });

  it("원고에 없는 것을 지어내지 말라고 한다", () => {
    expect(prompt).toMatch(/copyright/i);
    expect(prompt).toMatch(/Do not invent/i);
  });

  it("배경 글자는 금지가 아니라 자제다", () => {
    // 간판·표지판까지 막으면 그림이 어색해진다. 2026-08-20 결정.
    expect(prompt).toMatch(/sparse|subordinate/i);
    expect(prompt).not.toMatch(/not listed above/i);
  });

  it("타이포 관계를 따로 말한다", () => {
    expect(prompt).toMatch(/통과|through/i);
  });

  it("금지 항목을 전한다", () => {
    expect(prompt).toContain("로고, 워터마크");
  });

  it("출력 크기를 명시한다", () => {
    expect(prompt).toContain("1024x1536");
  });

  it("글자수를 숫자로 못 박지 않는다", () => {
    expect(prompt).not.toMatch(/\d+\s*characters/i);
  });

  it("빈 슬롯만 있어도 프롬프트가 깨지지 않는다", () => {
    const bare = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [], size });
    expect(bare.length).toBeGreaterThan(0);
    expect(bare).toContain("1024x1536");
  });

  it("글자 칸이 하나도 없으면 렌더 지시를 넣지 않는다", () => {
    const bare = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [], size });
    expect(bare).not.toMatch(/Render this/i);
  });

  it("픽셀을 모르는 모델에는 크기를 적지 않는다", () => {
    // 비율을 열거형으로 받는 모델은 픽셀이 없다. 그때 크기 자리에 0 이
    // 들어가 "Output size 0x0" 이 그대로 모델에게 갔다.
    const enumMode = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [] });
    expect(enumMode).not.toContain("0x0");
    expect(enumMode).not.toMatch(/Output size/i);
    // 크기와 함께 있던 지시는 남아야 한다.
    expect(enumMode).toContain("No outer border");
  });
});
