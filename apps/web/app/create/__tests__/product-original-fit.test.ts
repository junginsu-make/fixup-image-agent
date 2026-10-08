import { describe, expect, it } from "vitest";
import { ORIGINAL_FIT_EDGE, originalFitFor, usableOriginal } from "../pdp-utils";
import { photoForEditor } from "../product-photo-upload";

/**
 * **큰 원본은 거절하지 않고 3840 에 맞춘다**(최종 리뷰 A3, 판정 R3).
 *
 * 전에는 화면이 20MB 를 넘는 사진을 바로 거절했고, 40백만 화소를 넘는 사진은 분석(돈이 드는
 * 단계)을 다 마친 뒤 올리기에서야 막혔다. 이제 화면이 맞춰서 올린다.
 */
const MB20 = 20 * 1024 * 1024;

describe("원본을 그대로 둘지 맞출지", () => {
  it("정확히 40,000,000 화소는 그대로", () => {
    expect(originalFitFor({ width: 8000, height: 5000, bytes: 1 })).toEqual({ mode: "as-is" });
  });

  it("40,000,001 화소면 긴 변 3840 에 비율 그대로 맞춘다", () => {
    // 40,000,001 = 1 × 40,000,001 은 비현실적이라 같은 넘침을 가로세로로 만든다.
    const fit = originalFitFor({ width: 40_000_001, height: 1, bytes: 1 });
    expect(fit).toMatchObject({ mode: "fit", width: ORIGINAL_FIT_EDGE });
    expect(originalFitFor({ width: 8000, height: 5001, bytes: 1 })).toEqual({ mode: "fit", width: 3840, height: 2400 });
  });

  it("정확히 20MB 는 그대로, 1바이트라도 넘으면 맞춘다", () => {
    expect(originalFitFor({ width: 4000, height: 3000, bytes: MB20 })).toEqual({ mode: "as-is" });
    expect(originalFitFor({ width: 4000, height: 3000, bytes: MB20 + 1 })).toEqual({ mode: "fit", width: 3840, height: 2880 });
  });

  it("긴 변이 이미 3840 아래인데 용량만 크면 크기는 두고 다시 굽기만 한다", () => {
    expect(originalFitFor({ width: 3000, height: 2000, bytes: MB20 + 1 })).toEqual({ mode: "fit", width: 3000, height: 2000 });
  });

  it("세로 사진도 긴 변(세로)을 3840 에 맞춘다", () => {
    expect(originalFitFor({ width: 5001, height: 8000, bytes: 1 })).toEqual({ mode: "fit", width: 2400, height: 3840 });
  });
});

describe("캔버스가 빈 결과를 주면 원본을 버린다(C3)", () => {
  it.each([["data:,"], [""], ["data:image/jpeg;base64,"], ["not a data url"]])("%j → 없음", (value) => {
    expect(usableOriginal(value)).toBeUndefined();
  });

  it("정상 결과는 base64 와 그 mime", () => {
    expect(usableOriginal("data:image/jpeg;base64,QUJD")).toEqual({ base64: "QUJD", mimeType: "image/jpeg" });
  });
});

describe("편집기에 원본을 넘길지(A2)", () => {
  const prepared = { base64: "SMALL", original: { base64: "ORIGINAL", mimeType: "image/png" } };

  it("분석한 사진과 지금 사진이 같으면 원본을 넘긴다", () => {
    expect(photoForEditor(prepared, "SMALL")).toEqual(prepared.original);
  });

  it("분석 뒤 사진을 바꿨으면 넘기지 않는다 — 새 사진과 옛 구성·판독이 섞이지 않게", () => {
    expect(photoForEditor(prepared, "OTHER")).toBeUndefined();
  });

  it("분석 결과가 data URL 이어도 접두를 떼고 비교한다", () => {
    expect(photoForEditor(prepared, "data:image/jpeg;base64,SMALL")).toEqual(prepared.original);
  });

  it("준비한 사진이 없거나 원본이 없으면 없다", () => {
    expect(photoForEditor(null, "SMALL")).toBeUndefined();
    expect(photoForEditor({ base64: "SMALL" }, "SMALL")).toBeUndefined();
  });
});
