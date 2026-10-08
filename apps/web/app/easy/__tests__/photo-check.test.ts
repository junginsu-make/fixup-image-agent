import { describe, expect, it } from "vitest";
import { IMAGE_MODELS, POSTER_RATIOS, chooseModelForRatio } from "@fixup/sns-core";
import { isPhotoId, missingIds, photoLimit, uniqueIds } from "../photo-check";

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("붙인 사진 id (설계 §2-3 ⓪)", () => {
  it("같은 id 는 처음 자리 하나만 남긴다", () => {
    expect(uniqueIds([사진(2), 사진(1), 사진(2)])).toEqual([사진(2), 사진(1)]);
  });

  it("글자가 아닌 것은 뺀다", () => {
    expect(uniqueIds([사진(1), 3, null, ""])).toEqual([사진(1)]);
    expect(uniqueIds("아님")).toEqual([]);
  });

  it("uuid 모양만 사진 id 다", () => {
    expect(isPhotoId(사진(1))).toBe(true);
    expect(isPhotoId("../etc/passwd")).toBe(false);
  });

  /** 조회는 볼 수 없는 id 를 오류 없이 뺀다. 빼고 가면 번호가 당겨진다. */
  it("요청했는데 안 나온 id 를 찾는다", () => {
    expect(missingIds([사진(1), 사진(2)], [{ id: 사진(1) }])).toEqual([사진(2)]);
    expect(missingIds([사진(1)], [{ id: 사진(1) }])).toEqual([]);
  });
});

describe("장수 상한 — 기획 전에 본다 (설계 §2-6)", () => {
  it("경제형은 7장까지다", () => {
    expect(photoLimit({ ratio: "1:1", imageModel: "nano-banana", count: 7 }).ok).toBe(true);
    const 넘침 = photoLimit({ ratio: "1:1", imageModel: "nano-banana", count: 8 });
    expect(넘침.ok).toBe(false);
    if (!넘침.ok) {
      expect(넘침.message).toContain("7장");
      expect(넘침.message).toContain("8장");
    }
  });

  /**
   * **생성 라우트와 같은 모델로 본다.** 비율 때문에 모델이 바뀌면 상한도
   * 바뀐다 — 고른 모델로 보면 틀린다(`generate/route.ts:138`).
   */
  it("비율 때문에 바뀐 모델의 상한을 쓴다", () => {
    const 바뀌는비율 = POSTER_RATIOS.map((one) => one.id)
      .find((ratio) => chooseModelForRatio(ratio, "nano-banana").switched);
    expect(바뀌는비율, "경제형이 못 만드는 비율이 있어야 이 시험이 뜻을 갖는다").toBeDefined();
    const 바뀐모델 = chooseModelForRatio(바뀌는비율!, "nano-banana").model;
    expect(바뀐모델.maxReferenceImages).toBeGreaterThan(7);

    const 결과 = photoLimit({ ratio: 바뀌는비율!, imageModel: "nano-banana", count: 8 });
    expect(결과).toEqual({ ok: true, modelId: 바뀐모델.id, max: 바뀐모델.maxReferenceImages });
  });

  it("모르는 모델이면 기본 모델로 본다", () => {
    const 기본 = IMAGE_MODELS.find((model) => model.isDefault)!;
    expect(photoLimit({ ratio: "1:1", imageModel: "없는모델", count: 1 }))
      .toEqual({ ok: true, modelId: 기본.id, max: 기본.maxReferenceImages });
  });
});
