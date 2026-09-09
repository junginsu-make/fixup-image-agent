import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sliceTallReference, withSlicedStyleReference } = await import("../slice-image");
const { default: sharp } = await import("sharp");

/**
 * **진짜로 자르는지** 잰다.
 *
 * 자리 계산(`reference-slices.test.ts`)에는 시험이 있었지만, 실제로 sharp 를
 * 태우는 이 파일은 라우트 시험에서 통째로 mock 되어 있어 **본문을 `return page`
 * 로 비워도 2,006건이 전부 통과했다.** 「부르는가」와 「일을 하는가」는 다르다.
 */

async function png(width: number, height: number, alpha = false) {
  return (
    await sharp({
      create: {
        width,
        height,
        channels: alpha ? 4 : 3,
        background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 200, g: 30, b: 30 },
      },
    })
      .png()
      .toBuffer()
  ).toString("base64");
}

const meta = (base64: string) => sharp(Buffer.from(base64, "base64")).metadata();

describe("긴 레퍼런스", () => {
  it("조각으로 나뉘고, 폭 상한까지 줄어든다", async () => {
    const slices = await sliceTallReference({ imageBase64: await png(1200, 6000), mimeType: "image/png" });

    expect(slices).toHaveLength(3);
    for (const slice of slices) {
      expect(slice.mimeType).toBe("image/jpeg");
      const info = await meta(slice.imageBase64);
      expect(info.width).toBe(1024);
      expect(info.format).toBe("jpeg");
    }
  });

  it("조각들이 원본 높이를 다 덮는다", async () => {
    const slices = await sliceTallReference({ imageBase64: await png(1000, 5401), mimeType: "image/png" });
    const heights = await Promise.all(slices.map(async (s) => (await meta(s.imageBase64)).height ?? 0));
    // 폭이 1000 → 1024 로 안 커지므로(withoutEnlargement) 높이가 그대로 남는다.
    expect(heights.reduce((a, b) => a + b, 0)).toBe(5401);
  });

  /** JPEG 은 투명을 모른다. 깔개가 없으면 sharp 가 **검정** 위에 얹는다. */
  it("투명한 곳이 검게 안 변한다", async () => {
    const slices = await sliceTallReference({ imageBase64: await png(1000, 6000, true), mimeType: "image/png" });
    const first = await sharp(Buffer.from(slices[0]!.imageBase64, "base64")).raw().toBuffer();

    expect(first[0]).toBeGreaterThan(240);
    expect(first[1]).toBeGreaterThan(240);
    expect(first[2]).toBeGreaterThan(240);
  });
});

describe("짧은 레퍼런스", () => {
  /**
   * 자를 것이 없으면 손대지 않는다. 한 조각짜리도 다시 구우면 해상도가 절반이
   * 되고 무손실이 손실로 바뀐다 — 원본이 그대로 가야 서체 획이 산다.
   */
  it("원본이 그대로 간다", async () => {
    const 원본 = await png(2000, 3583);
    const slices = await sliceTallReference({ imageBase64: 원본, mimeType: "image/png" });

    expect(slices).toEqual([{ imageBase64: 원본, mimeType: "image/png" }]);
  });

  it("정사각도 그대로 간다", async () => {
    const 원본 = await png(900, 900);
    expect(await sliceTallReference({ imageBase64: 원본, mimeType: "image/png" })).toEqual([
      { imageBase64: 원본, mimeType: "image/png" },
    ]);
  });
});

describe("깨진 입력", () => {
  it("그림이 아니면 원본으로 떨어진다", async () => {
    const 쓰레기 = { imageBase64: Buffer.from("not an image").toString("base64"), mimeType: "image/png" };
    expect(await sliceTallReference(쓰레기)).toEqual([쓰레기]);
  });
});

describe("페이지 값에 채워 넣기", () => {
  it("긴 레퍼런스면 조각이 붙는다", async () => {
    const page = await withSlicedStyleReference({
      styleReference: { imageBase64: await png(1000, 6000), mimeType: "image/png" },
    });

    // 1000×6000 은 비율 6 → ceil(6/1.8) = 4조각.
    expect((page?.styleReference as { slices?: unknown[] })?.slices).toHaveLength(4);
  });

  it("레퍼런스가 없으면 그대로 둔다", async () => {
    const page = { aspectRatio: "3:4" } as { aspectRatio: string; styleReference?: { imageBase64: string; mimeType: string } };
    expect(await withSlicedStyleReference(page)).toBe(page);
    expect(await withSlicedStyleReference(undefined)).toBeUndefined();
  });
});
