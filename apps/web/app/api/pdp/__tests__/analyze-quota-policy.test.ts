import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumesAnalysisQuota } from "@fixup/pdp-core";

/**
 * **무슨 코드로 장부를 닫느냐가 분석 한도를 가른다**(C-9).
 *
 * SQL 은 `generation_events.error_code` 를 보고 시간당 분석 한도를 먹일지
 * 정한다(`202609200001_analysis_quota_policy.sql`). 그러니 라우트가 코드를
 * 뭉뚱그려 적으면 **공급자 장애가 사용자 한도를 먹는다.**
 *
 * 여기서는 라우트가 실제로 넘기는 코드를 받아, 그것이 면제되는지 먹는지를
 * `consumesAnalysisQuota` 로 그대로 물어본다. 한쪽만 고치면 여기가 빨개진다.
 */

vi.mock("server-only", () => ({}));

let analyze: () => Promise<unknown> = async () => ({ sections: [] });
let slice: (input: { imageBase64: string }) => Promise<unknown[]> = async () => [];

vi.mock("@fixup/pdp-core", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@fixup/pdp-core");
  return { ...actual, analyzeProduct: () => analyze() };
});

/** 장부에 실제로 적힌 것. */
const 닫은것: Array<{ success: boolean; errorCode?: string }> = [];

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  reserveAiUsage: async () => ({ ok: true as const, userId: "u1", requestId: "r1", usage: {} }),
  finalizeAiUsage: async () => ({}),
  settleAiUsage: async (
    _reservation: unknown,
    success: boolean,
    _units: number,
    errorCode?: string,
  ) => {
    닫은것.push({ success, errorCode });
    return {};
  },
}));

vi.mock("../../../../lib/pdp/providers", () => ({
  createPdpProviders: () => ({ llm: { generate: async () => ({ text: "{}" }) }, generateImage: async () => ({}) }),
}));

vi.mock("../../../../lib/pdp/slice-image", () => ({
  sliceTallReference: (input: { imageBase64: string }) => slice(input),
}));

const { POST } = await import("../analyze/route");

const 요청 = (body: unknown) =>
  new Request("http://localhost/api/pdp/analyze", { method: "POST", body: JSON.stringify(body) });

const 기본요청 = { imageBase64: "PRODUCT", mimeType: "image/png" };

beforeEach(() => {
  닫은것.length = 0;
  analyze = async () => ({ sections: [] });
  slice = async () => [];
});

/** 라우트가 마지막으로 적은 코드. */
function 적힌코드() {
  expect(닫은것.length, "장부를 한 번도 안 닫았다").toBeGreaterThan(0);
  return 닫은것[닫은것.length - 1]!.errorCode;
}

describe("모델이 일하지 않은 실패는 한도를 안 먹는다", () => {
  it("**공급자가 죽어 있으면 면제다** — 사용자는 아무것도 못 받았다", async () => {
    analyze = async () => {
      throw new Error("fetch failed");
    };

    const response = await POST(요청(기본요청));

    expect(response.status).toBe(503);
    expect(적힌코드()).toBe("AI_PROVIDER_UNAVAILABLE");
    expect(consumesAnalysisQuota(적힌코드())).toBe(false);
  });

  /**
   * **바깥 catch 가 「invalid_request」 한 줄로 닫던 자리.**
   *
   * 여기 오는 것은 요청 모양 문제가 아니다 — 요청 모양은 `readPdpRequest` 가
   * 예약 **전에** 되돌려 보내 행 자체가 안 생긴다. 실제로 오는 것은 키가
   * 없거나 레퍼런스를 자르다 터진 경우다.
   */
  it("**레퍼런스를 자르다 터져도 진짜 코드를 적는다**", async () => {
    const { PdpServiceError } = await vi.importActual<Record<string, never>>("@fixup/pdp-core");
    slice = async () => {
      throw new (PdpServiceError as never as new (c: string, m: string) => Error)(
        "AI_KEY_MISSING",
        "AI 공급자 키가 설정되지 않았습니다.",
      );
    };

    await POST(요청({ ...기본요청, styleReference: { imageBase64: "REF", mimeType: "image/png" } }));

    expect(적힌코드()).toBe("AI_KEY_MISSING");
    expect(적힌코드()).not.toBe("invalid_request");
    expect(consumesAnalysisQuota(적힌코드())).toBe(false);
  });
});

describe("모델이 답한 뒤의 실패는 한도를 먹는다", () => {
  it("**설계도를 못 읽은 것은 우리 값이 나간 뒤다**", async () => {
    const { PdpServiceError } = await vi.importActual<Record<string, never>>("@fixup/pdp-core");
    analyze = async () => {
      throw new (PdpServiceError as never as new (c: string, m: string, d?: string) => Error)(
        "INVALID_REQUEST",
        "설계도를 읽지 못했습니다.",
        "no sections",
      );
    };

    await POST(요청(기본요청));

    expect(적힌코드()).toBe("INVALID_REQUEST");
    expect(consumesAnalysisQuota(적힌코드())).toBe(true);
  });

  it("**우리 쪽 버그도 먹는다** — 면제 통에 섞어 넣지 않는다", async () => {
    analyze = async () => {
      throw new Error("Cannot read properties of undefined");
    };

    await POST(요청(기본요청));

    expect(적힌코드()).toBe("PDP_ANALYZE_FAILED");
    expect(consumesAnalysisQuota(적힌코드())).toBe(true);
  });

  it("성공은 먹는다", async () => {
    const response = await POST(요청(기본요청));

    expect(response.status).toBe(200);
    expect(닫은것[0]!.success).toBe(true);
    expect(consumesAnalysisQuota(닫은것[0]!.errorCode)).toBe(true);
  });
});
