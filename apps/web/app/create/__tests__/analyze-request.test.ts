import { describe, expect, it } from "vitest";
import { buildAnalyzeRequest } from "../analyze-request";
import type { AnalyzeRequestInputs } from "../analyze-request";

/**
 * 기획 요청 몸통을 **값으로** 잰다.
 *
 * 독립 리뷰가 이 자리를 짚었다 — `styleReference:` 블록을 통째로 지우거나
 * `styleRef` 로 오타를 내도 타입검사 0건 · 시험 1,885건 전부 통과 · 기능만
 * 죽었다. `apiJson` 이 몸통을 문자열로 받고 라우트도 캐스트뿐이라 아무도 안 본다.
 */

const 제품 = { base64: "PRODUCT", mimeType: "image/png", fileName: "p.png", previewUrl: "" };
const 레퍼런스 = {
  id: "r1",
  name: "레퍼런스",
  imageBase64: "REF",
  mimeType: "image/png",
  description: "짙은 올리브 배경 띠",
};

const 기본: AnalyzeRequestInputs = {
  preparedImage: 제품 as never,
  additionalInfo: "",
  sellerBrief: {},
  copyIntensity: "normal",
  gapPolicy: "ask",
  desiredTone: "",
  aspectRatio: "3:4",
  outputMode: "editable",
  styleReferenceEnabled: true,
  attachmentIntents: {},
};

describe("제품 사진은 언제나 실린다", () => {
  it("base64 와 형식이 그대로 간다", () => {
    const body = buildAnalyzeRequest(기본);
    expect(body.imageBase64).toBe("PRODUCT");
    expect(body.mimeType).toBe("image/png");
  });
});

describe("디자인 레퍼런스가 기획으로 간다", () => {
  it("붙어 있으면 그림·서술이 실린다", () => {
    const body = buildAnalyzeRequest({ ...기본, styleReference: 레퍼런스 as never });
    expect(body.styleReference).toEqual({
      imageBase64: "REF",
      mimeType: "image/png",
      description: "짙은 올리브 배경 띠",
      intent: undefined,
    });
  });

  it("그 그림에 적은 말이 함께 간다", () => {
    const body = buildAnalyzeRequest({
      ...기본,
      styleReference: 레퍼런스 as never,
      attachmentIntents: { style: "색만 가져와", anchor: "라벨 그대로" },
    });
    expect(body.styleReference?.intent).toBe("색만 가져와");
  });

  it("공백만 적은 것은 안 보낸다", () => {
    const body = buildAnalyzeRequest({
      ...기본,
      styleReference: 레퍼런스 as never,
      attachmentIntents: { style: "   " },
    });
    expect(body.styleReference?.intent).toBeUndefined();
  });

  it("레퍼런스가 없으면 그 칸이 아예 없다", () => {
    expect(buildAnalyzeRequest(기본).styleReference).toBeUndefined();
  });

  /** 토글을 끄면 그림도 지시도 안 간다. 화면 배지와 결과가 어긋나면 안 된다. */
  it("레퍼런스 토글을 끄면 안 보낸다", () => {
    const body = buildAnalyzeRequest({
      ...기본,
      styleReference: 레퍼런스 as never,
      styleReferenceEnabled: false,
      attachmentIntents: { style: "색만 가져와" },
    });
    expect(body.styleReference).toBeUndefined();
  });
});

describe("나머지 칸도 빠지지 않는다", () => {
  it("인물 사진 세 칸", () => {
    const body = buildAnalyzeRequest({
      ...기본,
      modelImage: { base64: "PERSON", mimeType: "image/jpeg", fileName: "m.jpg" } as never,
    });
    expect(body.modelImageBase64).toBe("PERSON");
    expect(body.modelImageMimeType).toBe("image/jpeg");
    expect(body.modelImageFileName).toBe("m.jpg");
  });

  it("공백만 적은 추가 정보·톤은 안 보낸다", () => {
    const body = buildAnalyzeRequest({ ...기본, additionalInfo: "  ", desiredTone: "\t" });
    expect(body.additionalInfo).toBeUndefined();
    expect(body.desiredTone).toBeUndefined();
  });

  it("설정 값이 그대로 실린다", () => {
    const body = buildAnalyzeRequest({
      ...기본,
      aspectRatio: "9:16",
      outputMode: "full-image",
      copyIntensity: "strong",
      gapPolicy: "omit",
    });
    expect(body.aspectRatio).toBe("9:16");
    expect(body.outputMode).toBe("full-image");
    expect(body.copyIntensity).toBe("strong");
    expect(body.gapPolicy).toBe("omit");
  });
});
