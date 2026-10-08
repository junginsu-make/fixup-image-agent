import { describe, expect, it } from "vitest";
import { IMAGE_MODELS, modelById } from "../models";
import { MATCH_SOURCE, chooseModelForRatio, nearestEnumRatio, sizeFromSource } from "../model-choice";

describe("첨부한 그림과 같은 비율로", () => {
  it("가로세로를 그대로 따라간다", () => {
    const size = sizeFromSource({ width: 1600, height: 900 }, modelById("gpt-image-2"));
    expect(size.pixel!.width / size.pixel!.height).toBeCloseTo(16 / 9, 2);
  });

  it("16 의 배수로 맞춘다", () => {
    // GPT Image 2 는 16 의 배수만 받는다.
    const size = sizeFromSource({ width: 1001, height: 777 }, modelById("gpt-image-2"));
    expect(size.pixel!.width % 16).toBe(0);
    expect(size.pixel!.height % 16).toBe(0);
  });

  it("너무 작으면 키운다", () => {
    // 최소 픽셀 수에 못 미치면 모델이 거부한다.
    const model = modelById("gpt-image-2");
    const size = sizeFromSource({ width: 200, height: 150 }, model);
    const pixels = size.pixel!.width * size.pixel!.height;
    expect(pixels).toBeGreaterThanOrEqual(model.pixelSizeLimits!.minPixels);
  });

  it("너무 크면 줄인다", () => {
    const model = modelById("gpt-image-2");
    const size = sizeFromSource({ width: 8000, height: 6000 }, model);
    expect(size.pixel!.width).toBeLessThanOrEqual(model.pixelSizeLimits!.maxEdge);
    expect(size.pixel!.height).toBeLessThanOrEqual(model.pixelSizeLimits!.maxEdge);
    expect(size.pixel!.width * size.pixel!.height)
      .toBeLessThanOrEqual(model.pixelSizeLimits!.maxPixels);
  });

  it("지나치게 긴 그림은 받지 않는다", () => {
    // 3:1 을 넘으면 모델이 거부한다. 조용히 잘라 다른 비율로 만들지 않는다.
    const size = sizeFromSource({ width: 4000, height: 500 }, modelById("gpt-image-2"));
    expect(size.rejected).toMatch(/비율/);
  });

  it("열거로만 받는 모델에는 못 쓴다", () => {
    const size = sizeFromSource({ width: 1600, height: 900 }, modelById("nano-banana"));
    expect(size.rejected).toBeTruthy();
  });
});

describe("가장 가까운 열거 비율 찾기", () => {
  it("16:9 사진은 16:9 로", () => {
    expect(nearestEnumRatio({ width: 1920, height: 1080 }, ["1:1", "16:9", "4:5"])).toBe("16:9");
  });

  it("정사각형에 가까우면 1:1 로", () => {
    expect(nearestEnumRatio({ width: 1000, height: 1010 }, ["1:1", "16:9", "4:5"])).toBe("1:1");
  });

  it("auto 는 후보에서 뺀다", () => {
    // 값이 아니라 "알아서" 라는 뜻이라 비교할 수 없다.
    expect(nearestEnumRatio({ width: 1000, height: 1000 }, ["auto", "16:9"])).toBe("16:9");
  });
});

describe("비율이 모델보다 우선한다", () => {
  it("고른 모델이 할 수 있으면 그대로 둔다", () => {
    const choice = chooseModelForRatio("1:1", "nano-banana");
    expect(choice.model.id).toBe("nano-banana");
    expect(choice.switched).toBe(false);
  });

  it("못 하면 할 수 있는 모델로 바꾼다", () => {
    // A4 인쇄용은 픽셀을 직접 지정해야 해서 열거 모델로는 못 만든다.
    const choice = chooseModelForRatio("a4-print", "nano-banana");
    // **id 를 못 박지 않는다.** 여기서 묻는 것은 「픽셀을 지정할 수 있는 모델로
    // 바꾸는가」이지 어느 모델인가가 아니다. 기본이 바뀌면 여기도 따라와야 하는데,
    // id 를 적어 두면 기본을 옮길 때마다 뜻과 무관하게 고치게 된다.
    expect(choice.model.pixelSizeLimits, "픽셀을 지정할 수 있어야 한다").toBeTruthy();
    expect(choice.switched).toBe(true);
    // 이름과 조사가 함께 맞아야 한다 — 「이전 방식 은 … 표준형 로」가 아니라.
    expect(choice.reason).toContain("이전 방식은");
    expect(choice.reason).toContain("표준형으로");
  });

  it("첨부 비율 그대로는 픽셀을 지정할 수 있는 모델이라야 한다", () => {
    const choice = chooseModelForRatio(MATCH_SOURCE, "nano-banana-pro");
    expect(choice.model.pixelSizeLimits).toBeTruthy();
    expect(choice.switched).toBe(true);
  });

  it("숨긴 모델로 만든 그림은 그 모델로 그대로 고친다", () => {
    expect(chooseModelForRatio("4:5", "gpt-image-2")).toMatchObject({ model: { id: "gpt-image-2" }, switched: false });
  });

  it("대체는 보이는 모델로만 — A4 인쇄용이면 표준형", () => {
    expect(chooseModelForRatio("a4-print", "nano-banana-2.1")).toMatchObject({
      model: { id: "gpt-image-2.5-flare" },
      switched: true,
    });
  });

  it("바꿀 이유를 남긴다", () => {
    // 조용히 바꾸면 사용자는 자기가 고른 모델로 만든 줄 안다.
    const choice = chooseModelForRatio("a4-print", "nano-banana");
    expect(choice.reason).toBeTruthy();
  });

  /**
   * **안내에 내부 이름을 쓰지 않는다**(2026-09-29 설명서 대조에서 발견).
   *
   * 「경제형은 a4-print를 만들 수 없어…」처럼 비율의 **내부 id** 가 화면에
   * 그대로 나갔다. 회원은 「a4-print」라는 말을 본 적이 없다 — 비율 버튼에는
   * 「A4 인쇄용」이라고 적혀 있다. 괄호 속 설명(약 290dpi)은 조사를 틀리게
   * 붙이므로 뺀다.
   */
  it("안내에 비율의 화면 이름을 쓴다", () => {
    const choice = chooseModelForRatio("a4-print", "nano-banana");

    expect(choice.reason).not.toContain("a4-print");
    expect(choice.reason).toContain("A4 인쇄용을");
  });

  it("못 만드는 비율을 알릴 때도 화면 이름을 쓴다", () => {
    const 아무도못함 = IMAGE_MODELS.map((model) => ({ ...model, pixelSizeLimits: undefined }));
    const choice = chooseModelForRatio("a4-print", "nano-banana", 아무도못함);

    expect(choice.reason).not.toContain("a4-print");
    expect(choice.reason).toContain("A4 인쇄용");
  });

  it("모르는 모델을 주면 기본 모델로 본다", () => {
    const choice = chooseModelForRatio("1:1", "없는-모델");
    // 「기본이 무엇인가」는 목록이 정한다. 여기서 다시 적으면 두 곳이 갈린다.
    expect(choice.model.id).toBe(IMAGE_MODELS.find((model) => model.isDefault)!.id);
  });

  it("아무도 못 하는 비율이면 알린다", () => {
    const choice = chooseModelForRatio("없는-비율", "gpt-image-2");
    expect(choice.reason).toBeTruthy();
  });
});
