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

describe("격자는 사본, 고르는 것은 원본", () => {
  const item = {
    id: "a", title: "겨울 세일",
    coverUrl: "signed:orig", coverThumbUrl: "signed:thumb",
  };

  it("격자에 걸 사본을 함께 준다", () => {
    // 고른 그림은 상세페이지·리디자인의 **생성 입력**으로 들어간다. 거기에
    // 사본을 물리면 크레딧을 쓰는 결과물의 품질이 조용히 깎인다.
    const [image] = toSavedLibraryImages([item]);

    expect(image!.url).toBe("signed:orig");
    expect(image!.thumbUrl).toBe("signed:thumb");
  });

  it("사본이 없는 옛 항목은 격자도 원본으로 떨어진다", () => {
    const [image] = toSavedLibraryImages([{ ...item, coverThumbUrl: null }]);

    expect(image!.url).toBe("signed:orig");
    expect(image!.thumbUrl).toBeNull();
  });
});
