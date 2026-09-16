import { describe, expect, it } from "vitest";
import { promptImagesFrom } from "../prompt-images";

/**
 * 첨부 목록 → 프롬프트가 쓸 그림 목록.
 *
 * **뽑아내는 이유는 하나다.** 04 기획 확인에서 「모델에 보낼 프롬프트」를
 * 미리 보여 주려면 제출 때와 **똑같이** 조립해야 한다. 두 벌로 두면 미리보기가
 * 거짓말을 하고, 그건 안 보여 주느니만 못하다(2026-09-16 설계 §4.2).
 */

describe("역할을 그림 종류로", () => {
  it("따라 만들기는 style_reference 다", () => {
    expect(promptImagesFrom([{ url: "a", role: "style" }])).toEqual([{ kind: "style_reference" }]);
  });

  it("제품 지키기는 물건이다", () => {
    expect(promptImagesFrom([{ url: "a", role: "preserve_product" }])).toEqual([
      { kind: "preserved", subject: "object", restyle: false },
    ]);
  });

  it("인물 지키기는 사람이다", () => {
    expect(promptImagesFrom([{ url: "a", role: "preserve_person" }])).toEqual([
      { kind: "preserved", subject: "person", restyle: false },
    ]);
  });

  /** **그림 느낌만 바꾸는 사람도 사람이다.** 물건으로 보면 얼굴을 안 지킨다. */
  it("다시 그리는 인물도 사람이고, 다시 그린다고 표시된다", () => {
    expect(promptImagesFrom([{ url: "a", role: "preserve_person_restyled" }])).toEqual([
      { kind: "preserved", subject: "person", restyle: true },
    ]);
  });

  /**
   * **차례가 곧 `Image N` 이다.** 받은 차례를 그대로 지킨다 — 여기서 뒤집으면
   * 「①번을」이라고 쓴 말이 반대로 읽힌다(`generate.ts:90` 주석).
   */
  it("받은 차례를 그대로 지킨다", () => {
    const images = promptImagesFrom([
      { url: "a", role: "preserve_person" },
      { url: "b", role: "style" },
      { url: "c", role: "preserve_product" },
    ]);

    expect(images.map((image) => image.kind)).toEqual(["preserved", "style_reference", "preserved"]);
    expect(images[0]).toMatchObject({ subject: "person" });
    expect(images[2]).toMatchObject({ subject: "object" });
  });

  it("첨부가 없으면 빈 목록이다", () => {
    expect(promptImagesFrom([])).toEqual([]);
  });
});
