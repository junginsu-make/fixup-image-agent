import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PdpPlanStage } from "@fixup/pdp-core";

/**
 * **라우트가 단계를 실제로 적고 실제로 돌려주는가**(2026-09-22 사용자 요청).
 *
 * 코어가 알리고 화면이 물어봐도, **가운데가 비어 있으면** 사용자에게는 아무
 * 일도 안 일어난다. 여기서 그 가운데를 잰다.
 */

vi.mock("server-only", () => ({}));

/** 코어가 알릴 단계들. 시험마다 바꾼다. */
let 알릴것: PdpPlanStage[] = [];
/** 기획이 끝나는가. 안 끝내면 진행 중인 채로 물어볼 수 있다. */
let 끝낸다 = true;

vi.mock("@fixup/pdp-core", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@fixup/pdp-core");
  return {
    ...actual,
    analyzeProduct: async (
      _request: unknown,
      _providers: unknown,
      options?: { onStage?: (stage: PdpPlanStage) => void },
    ) => {
      for (const stage of 알릴것) options?.onStage?.(stage);
      if (!끝낸다) await new Promise(() => {});
      return { blueprint: { sections: [] } };
    },
  };
});

/** 로그인했는가. 안 했을 때 무엇을 돌려주는지도 잰다. */
let 로그인했다 = true;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () =>
    로그인했다
      ? { ok: true, member: { userId: "u1" } }
      : { ok: false, response: Response.json({ ok: false, code: "unauthenticated" }, { status: 401 }) },
  reserveAiUsage: async () => ({ ok: true as const, userId: "u1", requestId: "r1", usage: {} }),
  finalizeAiUsage: async () => ({}),
  settleAiUsage: async () => ({}),
}));

vi.mock("../../../../lib/pdp/providers", () => ({
  createPdpProviders: () => ({ llm: { generate: async () => ({ text: "{}" }) }, generateImage: async () => ({}) }),
}));

vi.mock("../../../../lib/pdp/slice-image", () => ({ sliceTallReference: async () => [] }));

const { POST } = await import("../analyze/route");
const { GET } = await import("../analyze/progress/route");
const { resetPlanProgressForTest } = await import("../../../../lib/pdp/plan-progress");

const 번호 = "plan-abcdef123456";

const 기획한다 = (progressId: string | undefined = 번호) =>
  POST(
    new Request("http://localhost/api/pdp/analyze", {
      method: "POST",
      body: JSON.stringify({
        imageBase64: "PRODUCT",
        mimeType: "image/png",
        ...(progressId === undefined ? {} : { planProgressId: progressId }),
      }),
    }),
  );

const 물어본다 = async (id: string) => {
  const response = await GET(new Request(`http://localhost/api/pdp/analyze/progress?id=${encodeURIComponent(id)}`));
  return (await response.json()) as { ok: boolean; stage: string | null; message: string | null };
};

beforeEach(() => {
  resetPlanProgressForTest();
  알릴것 = [];
  끝낸다 = true;
  로그인했다 = true;
});

describe("기획이 도는 동안 물어보면", () => {
  it("**마지막으로 지난 자리를 돌려준다**", async () => {
    알릴것 = ["blueprint", "review"];
    끝낸다 = false;
    void 기획한다();
    // 위 기획은 안 끝난다. `onStage` 는 이미 다 돌았다.
    await new Promise<void>((resolve) => setImmediate(resolve));

    const 답 = await 물어본다(번호);

    expect(답.stage).toBe("review");
    expect(답.message, "옮긴 문장이 없다").toContain("검수");
  });

  it("**아직 아무 자리도 안 지났으면 모른다고 한다**", async () => {
    끝낸다 = false;
    void 기획한다();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect((await 물어본다(번호)).stage).toBeNull();
  });
});

describe("기획이 끝나면", () => {
  /**
   * **끝난 것을 들고 있지 않는다.** 화면은 응답으로 끝을 안다. 남겨 두면
   * 다음에 같은 번호로 물었을 때 지난 기획의 단계를 답하게 된다.
   */
  it("**단계를 지운다**", async () => {
    알릴것 = ["blueprint", "review", "finish"];
    await 기획한다();

    expect((await 물어본다(번호)).stage).toBeNull();
  });
});

describe("번호가 없거나 이상하면", () => {
  it("**번호를 안 보내도 기획은 된다**", async () => {
    알릴것 = ["blueprint"];

    const response = await 기획한다(undefined);

    expect(response.status).toBe(200);
  });

  it("**이상한 번호는 장부에 안 오른다**", async () => {
    알릴것 = ["review"];
    끝낸다 = false;
    void 기획한다("../x");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect((await 물어본다("../x")).stage).toBeNull();
  });
});

/**
 * **로그인한 사람만 물을 수 있다.**
 *
 * 모델을 안 부르고 메모리 한 칸을 읽는 값싼 문이라 그냥 열어 둘 뻔했다. 열어
 * 두면 번호를 훑어 **지금 누가 상세페이지를 만들고 있는지** 밖에서 셀 수 있다.
 */
describe("로그인", () => {
  it("**로그인 안 했으면 401 이다**", async () => {
    로그인했다 = false;

    const response = await GET(new Request(`http://localhost/api/pdp/analyze/progress?id=${번호}`));

    expect(response.status).toBe(401);
  });
});

/**
 * **남의 진행 상황은 안 알려 준다.**
 *
 * 번호를 찍어 맞히면 「이 사람이 지금 상세페이지를 만들고 있다」를 알게 된다.
 * 막는 값이 한 줄이라 막는다.
 */
describe("남의 것", () => {
  it("**다른 사람이 물으면 모른다고 한다**", async () => {
    알릴것 = ["review"];
    끝낸다 = false;
    void 기획한다();
    await new Promise<void>((resolve) => setImmediate(resolve));

    const { readPlanStage } = await import("../../../../lib/pdp/plan-progress");

    expect(readPlanStage(번호, "u1"), "주인은 볼 수 있어야 한다").toBe("review");
    expect(readPlanStage(번호, "u2"), "남이 봤다").toBeNull();
  });
});
