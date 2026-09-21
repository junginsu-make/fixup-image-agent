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

/**
 * **고친 전략은 재기획을 눌렀을 때만 간다**(U-11).
 *
 * 전략 칸을 고치는 것은 요약 수정일 뿐이다(설계 §4.2). 그것만으로 구성을 다시
 * 짜면 사용자가 글자 하나 고칠 때마다 유료 기획 호출이 나간다.
 */
describe("전략 재기획", () => {
  it("**눌렀으면 실어 보낸다**", () => {
    const 요청 = buildAnalyzeRequest({ ...기본, strategyDirective: "아침 시간을 되찾아 주는 이야기" });

    expect(요청.strategyDirective).toBe("아침 시간을 되찾아 주는 이야기");
  });

  it("**안 눌렀으면 안 보낸다**", () => {
    expect(buildAnalyzeRequest(기본).strategyDirective).toBeUndefined();
  });

  it("공백만 적은 전략은 안 보낸다 — 빈 지시로 값을 쓰지 않는다", () => {
    expect(buildAnalyzeRequest({ ...기본, strategyDirective: "   " }).strategyDirective).toBeUndefined();
  });
});

/**
 * **구성 요청과 그림체가 기획까지 간다**(U-06).
 *
 * 전에는 둘 다 이미지 생성에만 갔다. 사용자가 「섹션을 다섯 개로」를 적어도
 * 기획은 그 말을 본 적이 없고, 기획은 사진인지 그림인지 모른 채 장면을 썼다.
 */
describe("구성·문구 요청과 그림체", () => {
  it("**적었으면 실어 보낸다**", () => {
    const 요청 = buildAnalyzeRequest({ ...기본, planInstruction: "섹션을 다섯 개로" });

    expect(요청.planInstruction).toBe("섹션을 다섯 개로");
  });

  it("**그림체도 실어 보낸다**", () => {
    expect(buildAnalyzeRequest({ ...기본, look: "illustration" }).look).toBe("illustration");
  });

  it("안 적었으면 안 보낸다", () => {
    expect(buildAnalyzeRequest(기본).planInstruction).toBeUndefined();
  });

  it("공백만 적은 것은 안 보낸다", () => {
    expect(buildAnalyzeRequest({ ...기본, planInstruction: "   " }).planInstruction).toBeUndefined();
  });

  it("**장면 지시는 여전히 기획에 안 간다** — 다른 물건이다", () => {
    // 「배경은 밤」은 그림을 정하지 섹션 구성을 정하지 않는다.
    expect(Object.keys(buildAnalyzeRequest(기본))).not.toContain("userInstruction");
  });
});
