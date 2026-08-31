import { describe, expect, it } from "vitest";
import { normalizeImageOptions } from "../pdp-canvas-utils";
import type { ImageGenOptions } from "@fixup/pdp-core";

/**
 * 기본값을 채우는 함수가 **받은 것을 잃지 않아야 한다.**
 *
 * 엔진 쪽 같은 이름의 함수가 필드를 하나씩 나열하다가
 * `styleReferenceImages`·`preserveProductImage`·`characterReference` 를 삼켰다.
 * 그래서 레퍼런스와 캐릭터가 한 번도 반영되지 않았다. 옵션 타입의 필드가 모두
 * 선택(`?`)이라 타입 검사도 잡아 주지 않는다 — 테스트가 유일한 그물이다.
 */
describe("이미지 옵션 정규화", () => {
  it("목록에 없는 옵션도 살아남는다", () => {
    const options = {
      style: "lifestyle",
      withModel: true,
      styleReferenceImages: [{ base64: "SSSS", mimeType: "image/png" }],
      preserveProductImage: false,
      outputMode: "full-image",
      imageModel: "gpt-image-2",
      emphasisWords: ["촉촉"],
    } as unknown as ImageGenOptions;

    const normalized = normalizeImageOptions(options, false) as ImageGenOptions & {
      styleReferenceImages?: unknown;
      preserveProductImage?: boolean;
      emphasisWords?: string[];
    };

    expect(normalized.styleReferenceImages).toEqual([{ base64: "SSSS", mimeType: "image/png" }]);
    expect(normalized.preserveProductImage).toBe(false);
    expect(normalized.outputMode).toBe("full-image");
    expect(normalized.imageModel).toBe("gpt-image-2");
    expect(normalized.emphasisWords).toEqual(["촉촉"]);
  });

  it("빈 값에는 기본값을 채운다", () => {
    const normalized = normalizeImageOptions(undefined, true);
    expect(normalized.style).toBe("studio");
    expect(normalized.withModel).toBe(true);
    expect(normalized.guidePriorityMode).toBe("guide-first");
  });

  it("받은 값이 기본값을 이긴다", () => {
    const normalized = normalizeImageOptions(
      { style: "lifestyle", withModel: false } as ImageGenOptions,
      true,
    );
    expect(normalized.style).toBe("lifestyle");
    expect(normalized.withModel).toBe(false);
  });
});
