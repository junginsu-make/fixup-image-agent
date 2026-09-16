import { describe, expect, it } from "vitest";
import { EMPTY_SLOTS } from "../schemas";
import { previewPosterPrompt } from "../prompt-preview";

/**
 * **04 에서 「모델에 보낼 프롬프트」를 미리 보여 준다.**
 *
 * 지금은 최종 프롬프트가 무엇이었는지 아무도 못 본다. 그래서 「과했나 부족했나」를
 * 판단할 근거가 화면에 없다(2026-09-16 설계 §4.2).
 *
 * **미리보기가 실제와 다르면 안 보여 주느니만 못하다.** 그래서 제출 때 쓰는
 * `buildPosterPrompt`·`promptImagesFrom` 을 그대로 부른다. 여기서 새로 짓지 않는다.
 */

const 기본 = {
  slots: { ...EMPTY_SLOTS, headline: "가을 사진전", scene: "해 질 녘 바닷가" },
  attachments: [],
  ratioId: "2:3",
  modelId: "gpt-image-2.5-flare",
  look: "photoreal" as const,
};

describe("미리보기", () => {
  it("실제 프롬프트 조각들이 들어 있다", () => {
    const prompt = previewPosterPrompt(기본);

    expect(prompt).toContain("가을 사진전");
    expect(prompt).toContain("해 질 녘 바닷가");
    // 역할 문단은 늘 붙는다.
    expect(prompt).toContain("art director");
  });

  /** 크기 줄이 빠지면 모델이 제멋대로 만든다. 미리보기도 그것을 보여야 한다. */
  it("크기 줄이 들어 있다", () => {
    expect(previewPosterPrompt(기본)).toMatch(/Output size \d+x\d+/);
  });

  /** 사용자가 친 말은 맨 앞과 맨 뒤 두 번이다(2026-09-04 실측). */
  it("사용자가 친 말이 두 번 들어간다", () => {
    const prompt = previewPosterPrompt({ ...기본, userInstruction: "배경은 밤" });
    const count = prompt.split("배경은 밤").length - 1;

    expect(count).toBe(2);
  });

  /**
   * **첨부 번호가 제출 때와 같아야 한다.** 미리보기에서 ①이 인물인데 실제로는
   * 레퍼런스면, 미리보기를 보고 고친 말이 엉뚱한 그림에 붙는다.
   */
  it("첨부 번호와 역할이 차례대로 붙는다", () => {
    const prompt = previewPosterPrompt({
      ...기본,
      attachments: [
        { url: "a", role: "preserve_person" as const },
        { url: "b", role: "style" as const },
      ],
    });

    expect(prompt).toContain("Image 1");
    expect(prompt).toContain("Image 2");
    expect(prompt.indexOf("Image 1")).toBeLessThan(prompt.indexOf("Image 2"));
  });

  /** 결을 고르면 그 지시가 실린다. auto 면 아무 말도 안 보탠다. */
  it("결 지시가 실린다", () => {
    expect(previewPosterPrompt({ ...기본, look: "anime" })).toContain("cel");
    expect(previewPosterPrompt({ ...기본, look: "auto" })).not.toContain("cel");
  });

  /**
   * **첨부한 그림을 따라가는 비율은 크기를 미리 알 수 없다.** 실제 그림에서
   * 뽑기 때문이다(`generate.ts`). 없는 숫자를 지어내지 않는다.
   */
  it("match-source 는 크기를 지어내지 않는다", () => {
    const prompt = previewPosterPrompt({ ...기본, ratioId: "match-source" });

    expect(prompt).not.toMatch(/Output size \d+x\d+/);
  });

  /** 모르는 모델이면 미리보기가 죽으면 안 된다 — 04 화면 전체가 멎는다. */
  it("모르는 모델이어도 안 죽는다", () => {
    expect(() => previewPosterPrompt({ ...기본, modelId: "없는모델" })).not.toThrow();
  });
});
