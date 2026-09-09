import { describe, expect, it } from "vitest";
import { buildSectionImageOptions, pageInputsFromWire, usesUploadedPerson } from "./pdp.image-options";
import type { PageImageInputs, SectionImageTarget } from "./pdp.image-options";
import type { SectionBlueprint } from "./types";

/**
 * **값으로 잰다.** 「같은 함수를 쓴다」를 문자열로 대조하면 안이 뒤집혀도 통과한다
 * (2026-09-08 카드뉴스에서 실제로 그랬다). 여기서는 나온 옵션을 직접 본다.
 */

const section = (id: string, headline = "제목"): SectionBlueprint =>
  ({
    section_id: id,
    headline,
    subheadline: "부제",
    prompt_en: "a product photo",
    layout_notes: "",
  }) as unknown as SectionBlueprint;

const 인물사진 = { base64: "PERSON", mimeType: "image/png", fileName: "p.png" };
const 캐릭터 = { base64: "CHAR", mimeType: "image/png", identityPrompt: "같은 사람" };

const target = (over: Partial<SectionImageTarget> = {}): SectionImageTarget => ({
  section: section("s1"),
  index: 0,
  ...over,
});

describe("업로드한 인물 사진을 어느 섹션이 쓰는가", () => {
  it("사진이 없으면 어느 섹션도 안 쓴다", () => {
    const page: PageImageInputs = { referenceModelUsage: "all-sections" };
    expect(usesUploadedPerson(page, target({ index: 0 }))).toBe(false);
  });

  it("「첫 섹션만」이면 히어로에만 들어간다", () => {
    const page: PageImageInputs = { referenceModel: 인물사진, referenceModelUsage: "hero-only" };
    expect(usesUploadedPerson(page, target({ index: 0 }))).toBe(true);
    expect(usesUploadedPerson(page, target({ index: 1 }))).toBe(false);
    expect(usesUploadedPerson(page, target({ index: 5 }))).toBe(false);
  });

  it("「전 섹션」이면 모든 자리에 들어간다", () => {
    const page: PageImageInputs = { referenceModel: 인물사진, referenceModelUsage: "all-sections" };
    expect(usesUploadedPerson(page, target({ index: 0 }))).toBe(true);
    expect(usesUploadedPerson(page, target({ index: 3 }))).toBe(true);
  });

  it("섹션에서 직접 끄면 히어로여도 안 쓴다", () => {
    const page: PageImageInputs = { referenceModel: 인물사진, referenceModelUsage: "all-sections" };
    expect(usesUploadedPerson(page, target({ index: 0, options: { withModel: false } }))).toBe(false);
  });

  it("섹션에서 직접 켜면 히어로가 아니어도 쓴다", () => {
    const page: PageImageInputs = { referenceModel: 인물사진, referenceModelUsage: "hero-only" };
    expect(usesUploadedPerson(page, target({ index: 4, options: { withModel: true } }))).toBe(true);
  });
});

describe("사진은 쓰는 섹션에만 실린다", () => {
  const page: PageImageInputs = { referenceModel: 인물사진, referenceModelUsage: "hero-only" };

  it("쓰는 섹션에는 세 칸이 다 찬다", () => {
    const built = buildSectionImageOptions(page, target({ index: 0 }));
    expect(built.referenceModelImageBase64).toBe("PERSON");
    expect(built.referenceModelImageMimeType).toBe("image/png");
    expect(built.referenceModelImageFileName).toBe("p.png");
  });

  it("안 쓰는 섹션에는 한 칸도 안 간다", () => {
    const built = buildSectionImageOptions(page, target({ index: 2 }));
    expect(built.referenceModelImageBase64).toBeUndefined();
    expect(built.referenceModelImageMimeType).toBeUndefined();
    expect(built.referenceModelImageFileName).toBeUndefined();
  });
});

describe("withModel 은 인물 참조가 실제로 붙었을 때만 참이다", () => {
  it("아무 인물도 없으면 거짓", () => {
    expect(buildSectionImageOptions({}, target()).withModel).toBe(false);
  });

  it("업로드 사진을 쓰는 섹션이면 참", () => {
    const page: PageImageInputs = { referenceModel: 인물사진, referenceModelUsage: "hero-only" };
    expect(buildSectionImageOptions(page, target({ index: 0 })).withModel).toBe(true);
  });

  it("업로드 사진이 있어도 안 쓰는 섹션이면 거짓", () => {
    const page: PageImageInputs = { referenceModel: 인물사진, referenceModelUsage: "hero-only" };
    expect(buildSectionImageOptions(page, target({ index: 2 })).withModel).toBe(false);
  });

  /**
   * 일괄 라우트가 withModel: false 를 박아 둬서 생겼던 모순이다.
   * 캐릭터는 얼굴 참조로 붙는데 장면 지시는 「사람은 선택」이라고 말했다.
   */
  it("캐릭터만 붙어도 참이다", () => {
    const built = buildSectionImageOptions({}, target({ characterReference: 캐릭터 }));
    expect(built.withModel).toBe(true);
    expect(built.characterReference).toEqual(캐릭터);
  });

  it("사진을 안 쓰는 섹션이어도 캐릭터가 있으면 참", () => {
    const page: PageImageInputs = { referenceModel: 인물사진, referenceModelUsage: "hero-only" };
    const built = buildSectionImageOptions(page, target({ index: 3, characterReference: 캐릭터 }));
    expect(built.withModel).toBe(true);
    expect(built.referenceModelImageBase64).toBeUndefined();
  });
});

describe("페이지가 정하는 것과 섹션이 정하는 것", () => {
  const page: PageImageInputs = {
    imageModel: "nano-banana",
    outputMode: "full-image",
    look: "anime",
    userInstruction: "밤 장면으로",
    preserveProduct: false,
    styleReferenceImages: [{ base64: "REF", mimeType: "image/png", description: "참고" }],
  };

  it("페이지 값은 섹션 값이 있어도 이긴다", () => {
    const built = buildSectionImageOptions(
      page,
      target({ options: { imageModel: "gpt-image-2", look: "3d", userInstruction: "낮 장면" } }),
    );
    expect(built.imageModel).toBe("nano-banana");
    expect(built.look).toBe("anime");
    expect(built.userInstruction).toBe("밤 장면으로");
    expect(built.outputMode).toBe("full-image");
    expect(built.preserveProductImage).toBe(false);
  });

  it("디자인 레퍼런스는 한 장짜리 배열로 실린다", () => {
    expect(buildSectionImageOptions(page, target()).styleReferenceImages).toEqual([
      { base64: "REF", mimeType: "image/png", description: "참고" },
    ]);
  });

  it("레퍼런스가 없으면 빈 배열이 아니라 아예 없다", () => {
    expect(buildSectionImageOptions({}, target()).styleReferenceImages).toBeUndefined();
  });

  it("제품 지키기는 안 정하면 켜 둔다", () => {
    expect(buildSectionImageOptions({}, target()).preserveProductImage).toBe(true);
  });

  it("제목·부제는 섹션에서 가져온다", () => {
    const built = buildSectionImageOptions({}, target({ section: section("s9", "특가") }));
    expect(built.headline).toBe("특가");
    expect(built.subheadline).toBe("부제");
  });

  it("강조 단어가 비면 빈 배열을 넘기지 않는다", () => {
    expect(buildSectionImageOptions({}, target({ emphasisWords: [] })).emphasisWords).toBeUndefined();
    expect(buildSectionImageOptions({}, target({ emphasisWords: ["특가"] })).emphasisWords).toEqual(["특가"]);
  });

  it("섹션이 고른 결은 안 사라진다 — 페이지가 안 정했을 때", () => {
    const built = buildSectionImageOptions({}, target({ options: { style: "outdoor", modelCountry: "japan" } }));
    expect(built.style).toBe("outdoor");
    expect(built.modelCountry).toBe("japan");
  });

  it("섹션이 결을 안 고르면 studio 다", () => {
    expect(buildSectionImageOptions({}, target()).style).toBe("studio");
  });
});

describe("자리별 지시는 페이지 값이다", () => {
  it("조립기가 그대로 실어 준다", () => {
    const built = buildSectionImageOptions(
      { attachmentIntents: { style: "색만 가져와", anchor: "라벨 그대로" } },
      target(),
    );
    expect(built.attachmentIntents).toEqual({ style: "색만 가져와", anchor: "라벨 그대로" });
  });

  it("모든 섹션이 같은 지시를 받는다 — 첨부가 페이지 단위이기 때문이다", () => {
    const page = { attachmentIntents: { style: "색만 가져와" } };
    expect(buildSectionImageOptions(page, target({ index: 0 })).attachmentIntents).toEqual(
      buildSectionImageOptions(page, target({ index: 4 })).attachmentIntents,
    );
  });

  it("안 적으면 없다", () => {
    expect(buildSectionImageOptions({}, target()).attachmentIntents).toBeUndefined();
  });
});

/**
 * 그물 너머에서 온 값이 **하나도 빠지지 않고** 안쪽 모양으로 바뀌는가.
 *
 * 독립 리뷰가 이 자리를 짚었다 — `attachmentIntents` 한 줄을 지워도 492건이
 * 전부 통과했다. 운반 구간에는 시험이 없었다.
 */
describe("그물 값에서 페이지 값으로", () => {
  it("모든 칸이 넘어온다", () => {
    expect(
      pageInputsFromWire({
        imageModel: "gpt-image-2",
        outputMode: "full-image",
        look: "anime",
        userInstruction: "밤 장면으로",
        preserveProduct: false,
        styleReference: { imageBase64: "REF", mimeType: "image/png", description: "참고" },
        referenceModel: { imageBase64: "PERSON", mimeType: "image/jpeg", fileName: "p.jpg" },
        referenceModelUsage: "hero-only",
        attachmentIntents: { style: "색만 가져와", person: "안경", anchor: "라벨 그대로" },
      }),
    ).toEqual({
      imageModel: "gpt-image-2",
      outputMode: "full-image",
      look: "anime",
      userInstruction: "밤 장면으로",
      preserveProduct: false,
      styleReferenceImages: [{ base64: "REF", mimeType: "image/png", description: "참고" }],
      referenceModel: { base64: "PERSON", mimeType: "image/jpeg", fileName: "p.jpg" },
      referenceModelUsage: "hero-only",
      attachmentIntents: { style: "색만 가져와", person: "안경", anchor: "라벨 그대로" },
    });
  });

  it("그물 이름과 안쪽 이름이 여기서만 만난다", () => {
    const page = pageInputsFromWire({
      styleReference: { imageBase64: "REF", mimeType: "image/png" },
    });
    expect(page.styleReferenceImages).toEqual([
      { base64: "REF", mimeType: "image/png", description: undefined },
    ]);
  });

  it("아무것도 안 오면 빈 값이다", () => {
    expect(pageInputsFromWire()).toEqual({});
  });

  it("**끝까지 이어진다** — 그물 값이 조립된 옵션에 그대로 남는다", () => {
    const built = buildSectionImageOptions(
      pageInputsFromWire({ attachmentIntents: { style: "색만 가져와" } }),
      target(),
    );
    expect(built.attachmentIntents).toEqual({ style: "색만 가져와" });
  });
});

/**
 * 긴 레퍼런스는 **조각으로 나눠서** 온다. 맨 위 한 장만 보내면 중간부터
 * 달라지는 디자인을 못 본다.
 */
describe("레퍼런스 조각이 그림 옵션까지 간다", () => {
  it("조각이 오면 순서대로 전부 실린다", () => {
    const page = pageInputsFromWire({
      styleReference: {
        imageBase64: "WHOLE",
        mimeType: "image/png",
        description: "참고",
        slices: [
          { imageBase64: "TOP", mimeType: "image/jpeg" },
          { imageBase64: "MID", mimeType: "image/jpeg" },
        ],
      },
    });
    expect(page.styleReferenceImages?.map((image) => image.base64)).toEqual(["TOP", "MID"]);
  });

  it("서술은 첫 조각에만 붙는다 — 조각마다 되풀이하면 규칙으로 찬다", () => {
    const page = pageInputsFromWire({
      styleReference: {
        imageBase64: "WHOLE",
        mimeType: "image/png",
        description: "짙은 올리브",
        slices: [
          { imageBase64: "TOP", mimeType: "image/jpeg" },
          { imageBase64: "MID", mimeType: "image/jpeg" },
        ],
      },
    });
    expect(page.styleReferenceImages?.[0]!.description).toBe("짙은 올리브");
    expect(page.styleReferenceImages?.[1]!.description).toBeUndefined();
  });

  it("조각이 없으면 원본 한 장이다", () => {
    const page = pageInputsFromWire({
      styleReference: { imageBase64: "WHOLE", mimeType: "image/png" },
    });
    expect(page.styleReferenceImages?.map((image) => image.base64)).toEqual(["WHOLE"]);
  });

  it("모든 섹션이 같은 조각들을 받는다", () => {
    const page = pageInputsFromWire({
      styleReference: {
        imageBase64: "W",
        mimeType: "image/png",
        slices: [
          { imageBase64: "A", mimeType: "image/jpeg" },
          { imageBase64: "B", mimeType: "image/jpeg" },
        ],
      },
    });
    expect(buildSectionImageOptions(page, target({ index: 0 })).styleReferenceImages).toEqual(
      buildSectionImageOptions(page, target({ index: 5 })).styleReferenceImages,
    );
  });
});

/**
 * 「그 밖에 · 채널과 시즌」이 그림까지 가는 배선.
 *
 * 독립 리뷰가 이 자리를 짚었다 — 네 구간 중 **어느 하나를 끊어도** 2,006건이
 * 전부 통과했다. 운반 구간에 시험이 없다는 이 저장소의 같은 실패가 네 번째다.
 */
describe("페이지 배경 설명이 섹션까지 간다", () => {
  it("그물에서 페이지 값으로 옮겨진다", () => {
    expect(
      pageInputsFromWire({ imageModel: "nano-banana", outputMode: "full-image", pageContext: "여름 시즌" })
        .pageContext,
    ).toBe("여름 시즌");
  });

  it("페이지 값에서 섹션 옵션으로 옮겨진다", () => {
    const page: PageImageInputs = { pageContext: "여름 시즌, 인스타 유입" };
    expect(buildSectionImageOptions(page, target()).pageContext).toBe("여름 시즌, 인스타 유입");
    expect(buildSectionImageOptions(page, target({ index: 4 })).pageContext).toBe("여름 시즌, 인스타 유입");
  });

  it("안 적었으면 아무것도 안 붙는다", () => {
    expect(buildSectionImageOptions({}, target()).pageContext).toBeUndefined();
  });
});
