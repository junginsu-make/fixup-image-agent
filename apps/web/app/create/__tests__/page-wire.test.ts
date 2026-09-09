import { describe, expect, it } from "vitest";
import { buildPageWire } from "../page-wire";

/**
 * 운반 배선을 **값으로** 잰다.
 *
 * 독립 리뷰가 이 자리를 짚었다 — 한 줄(`attachmentIntents,`)을 지워도 시험
 * 1,357건이 전부 통과했다. 조용하고, 타입도 통과하고, 돈은 나간다. 2026-09-08
 * 카드뉴스 사고와 같은 실패 모양이 한 칸 앞으로 옮겨진 것이었다.
 */

const 기본 = {
  imageModel: "nano-banana" as const,
  outputMode: "full-image" as const,
  userInstruction: "",
};

describe("페이지 값이 하나도 빠지지 않는다", () => {
  it("넣은 것이 그대로 나온다", () => {
    expect(
      buildPageWire({
        ...기본,
        look: "anime",
        userInstruction: "밤 장면으로",
        preserveProduct: false,
        styleReference: { imageBase64: "REF", mimeType: "image/png", description: "참고" },
        referenceModel: { base64: "PERSON", mimeType: "image/png", fileName: "p.png" },
        referenceModelUsage: "all-sections",
        attachmentIntents: { style: "색만 가져와", anchor: "라벨 그대로" },
        pageContext: "여름 시즌, 인스타 유입",
      }),
    ).toEqual({
      imageModel: "nano-banana",
      outputMode: "full-image",
      look: "anime",
      userInstruction: "밤 장면으로",
      preserveProduct: false,
      styleReference: { imageBase64: "REF", mimeType: "image/png", description: "참고" },
      referenceModel: { imageBase64: "PERSON", mimeType: "image/png", fileName: "p.png" },
      referenceModelUsage: "all-sections",
      attachmentIntents: { style: "색만 가져와", anchor: "라벨 그대로" },
      pageContext: "여름 시즌, 인스타 유입",
    });
  });

  /** 「그 밖에 · 채널과 시즌」. 이 줄을 지워도 2,006건이 통과했다. */
  it("페이지 배경 설명이 실린다", () => {
    expect(buildPageWire({ ...기본, pageContext: "여름 시즌" }).pageContext).toBe("여름 시즌");
  });

  it("자리별 지시가 실린다", () => {
    expect(
      buildPageWire({ ...기본, attachmentIntents: { person: "안경을 씌워 주세요" } })
        .attachmentIntents,
    ).toEqual({ person: "안경을 씌워 주세요" });
  });

  it("인물 사진의 열쇠 이름이 그물 이름으로 바뀐다", () => {
    const wire = buildPageWire({
      ...기본,
      referenceModel: { base64: "PERSON", mimeType: "image/jpeg" },
    });
    expect(wire.referenceModel).toEqual({
      imageBase64: "PERSON",
      mimeType: "image/jpeg",
      fileName: undefined,
    });
  });
});

describe("빈 값은 안 싣는다", () => {
  it("공백만 적은 배경 설명은 없는 것으로 보낸다", () => {
    expect(buildPageWire({ ...기본, pageContext: "   " }).pageContext).toBeUndefined();
  });

  it("공백만 적은 지시는 없는 것으로 보낸다", () => {
    expect(buildPageWire({ ...기본, userInstruction: "   " }).userInstruction).toBeUndefined();
  });

  it("인물 사진이 없으면 그 칸이 아예 없다", () => {
    expect(buildPageWire({ ...기본, referenceModel: null }).referenceModel).toBeUndefined();
  });

  it("아무것도 안 넣으면 필수 값만 남는다", () => {
    const wire = buildPageWire(기본);
    expect(wire.imageModel).toBe("nano-banana");
    expect(wire.attachmentIntents).toBeUndefined();
    expect(wire.styleReference).toBeUndefined();
  });
});
