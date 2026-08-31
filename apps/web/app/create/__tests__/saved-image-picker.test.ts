import { describe, expect, it } from "vitest";
import { toSavedLibraryImages } from "../saved-image-picker";

describe("toSavedLibraryImages", () => {
  const items = [
    {
      id: "generated",
      title: "상세페이지 작업",
      coverUrl: "https://example.com/generated.png",
      sourceType: "generation" as const,
    },
    {
      id: "character",
      title: "민감성 피부 모델 (캐릭터)",
      coverUrl: "https://example.com/character.png",
      sourceType: "character" as const,
    },
  ];

  it("일반 이미지 선택창에서는 캐릭터 자동 저장물을 제외한다", () => {
    expect(toSavedLibraryImages(items, true).map((image) => image.id)).toEqual(["lib-generated"]);
  });

  it("다른 라이브러리 선택창에는 기존처럼 모든 결과물을 제공한다", () => {
    expect(toSavedLibraryImages(items).map((image) => image.id)).toEqual([
      "lib-generated",
      "lib-character",
    ]);
  });
});
