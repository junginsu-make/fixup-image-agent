import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 기획 요청에 **조각난 레퍼런스가 실려 나가는가.**
 *
 * `/api/pdp/analyze` 에는 시험이 하나도 없었다. 그래서 라우트에서 자르는 줄을
 * 통째로 지워도 2,006건이 전부 통과했다 — 긴 레퍼런스가 폭 100픽셀 띠로 돌아가고
 * 아무도 모른다. 여기서는 `analyzeProduct` 가 받는 값을 직접 본다.
 */

vi.mock("server-only", () => ({}));

const analyzed: Array<{ styleReference?: { slices?: Array<{ imageBase64: string }> } }> = [];

vi.mock("@fixup/pdp-core", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@fixup/pdp-core");
  return {
    ...actual,
    analyzeProduct: async (request: { styleReference?: unknown }) => {
      analyzed.push(request as never);
      return { sections: [] };
    },
  };
});

vi.mock("../../../../lib/membership/api", () => ({
  reserveAiUsage: async () => ({ ok: true as const, userId: "u1", requestId: "r1", usage: {} }),
  finalizeAiUsage: async () => ({}),
  // 장부가 안 닫혀도 결과를 돌려주는 쪽(2026-09-09 master). 없으면 성공 경로가
  // 통째로 500 이 된다 — 병합 뒤 이 시험이 실제로 그렇게 깨졌다.
  settleAiUsage: async () => ({}),
}));

vi.mock("../../../../lib/pdp/providers", () => ({
  createPdpProviders: () => ({ llm: { generate: async () => ({ text: "{}" }) }, generateImage: async () => ({}) }),
}));

const sliceOptions: Array<Record<string, unknown> | undefined> = [];

// sharp 없이 자르기를 흉내 낸다. 실제로 자르는 동작은 `slice-image.test.ts` 가 잰다.
vi.mock("../../../../lib/pdp/slice-image", () => ({
  sliceTallReference: async (input: { imageBase64: string }, options?: Record<string, unknown>) => [
    ...(sliceOptions.push(options), []),
    { imageBase64: `${input.imageBase64}-1`, mimeType: "image/jpeg" },
    { imageBase64: `${input.imageBase64}-2`, mimeType: "image/jpeg" },
  ],
}));

const { POST } = await import("../analyze/route");

const 요청 = (body: unknown) =>
  new Request("http://localhost/api/pdp/analyze", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  analyzed.length = 0;
  sliceOptions.length = 0;
});

describe("기획 요청", () => {
  it("레퍼런스를 조각내서 넘긴다", async () => {
    const response = await POST(
      요청({
        imageBase64: "PRODUCT",
        mimeType: "image/png",
        styleReference: { imageBase64: "REF", mimeType: "image/png", description: "참고" },
      }),
    );

    expect(response.status).toBe(200);
    expect(analyzed).toHaveLength(1);
    expect(analyzed[0]!.styleReference?.slices).toEqual([
      { imageBase64: "REF-1", mimeType: "image/jpeg" },
      { imageBase64: "REF-2", mimeType: "image/jpeg" },
    ]);
  });

  /** 기획 요청은 여러 번 나간다. 그림 경로와 달리 폭 상한을 켜야 한다. */
  it("폭 상한을 켜서 자른다", async () => {
    await POST(
      요청({
        imageBase64: "PRODUCT",
        mimeType: "image/png",
        styleReference: { imageBase64: "REF", mimeType: "image/png" },
      }),
    );

    expect(sliceOptions).toEqual([{ shrinkWhole: true }]);
  });

  it("레퍼런스가 없으면 그 칸이 아예 없다", async () => {
    await POST(요청({ imageBase64: "PRODUCT", mimeType: "image/png" }));

    expect(analyzed).toHaveLength(1);
    expect(analyzed[0]!.styleReference).toBeUndefined();
  });
});
