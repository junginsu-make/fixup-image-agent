import { afterEach, describe, expect, it, vi } from "vitest";
import { RedesignFalError, createRedesignImageGenerator } from "../redesign/image-generator";
import type { FalQueueOps } from "../fal/http";
import type { FalRouter } from "../fal/route";

/**
 * **리디자인도 대기열로 받는다**(설계 2026-09-29 §3.3, S3a). 화면에 가는 문구는 동기 호출 때와 같다 —
 * 429 는 「몰렸다」, 상태 코드가 있으면 그 번호, 우리 쪽 상한은 「너무 오래」.
 */

const 받은것: unknown[] = [];
function 길(submit: () => Promise<string> = async () => "rd-1"): FalRouter {
  return {
    async submit(endpoint, input, options) {
      받은것.push({ endpoint, model: (options?.cost as { model?: string } | undefined)?.model, startTimeoutS: options?.startTimeoutS, prompt: input.prompt });
      return { requestId: await submit(), route: { accountId: null, key: "k" } };
    },
    async routeOf() { return { accountId: null, key: "k" }; },
    finished() {},
    async uploadRoute() { return { accountId: null, key: "k" }; },
  };
}

function 묻기(result: () => Promise<unknown>): { opsFor: () => FalQueueOps } {
  const ops: FalQueueOps = { status: async () => "completed", result, cancel: async () => {} };
  return { opsFor: () => ops };
}

const 만들기 = (router: FalRouter, deps: Partial<Parameters<typeof createRedesignImageGenerator>[3]> = {}) =>
  createRedesignImageGenerator({ FAL_KEY: "k" }, undefined, router, { sleep: async () => {}, ...deps });

const 부탁 = { prompt: "p", references: [], size: "1152x2048" };

afterEach(() => {
  받은것.length = 0;
  vi.unstubAllGlobals();
});

describe("리디자인 대기열", () => {
  it("i2i 엔드포인트로, 실제로 그린 모델 id 를 값으로, fal 쪽 대기 상한을 함께 보낸다", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([7]), { headers: { "content-type": "image/png" } }));
    const image = await 만들기(길(), 묻기(async () => ({ images: [{ url: "https://cdn/r.png" }] })))(부탁);
    expect(받은것).toEqual([{ endpoint: "openai/gpt-image-2.5/flare/edit", model: "gpt-image-2.5-flare", startTimeoutS: 120, prompt: "p" }]);
    expect(image.buffer).toEqual(Buffer.from([7]));
  });

  it("제출이 429 면 「몰렸다」", async () => {
    const router = 길(async () => { throw Object.assign(new Error("busy"), { status: 429 }); });
    await expect(만들기(router)(부탁)).rejects.toEqual(new RedesignFalError("이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요."));
  });

  it("fal 이 대기 상한 안에 시작하지 못했으면(504 user) 「몰렸다」", async () => {
    const fake = 묻기(async () => { throw Object.assign(new Error("timeout"), { status: 504, timeoutType: "user" }); });
    await expect(만들기(길(), fake)(부탁)).rejects.toThrow("이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("그 밖의 거절은 상태 번호를 말한다", async () => {
    const fake = 묻기(async () => { throw Object.assign(new Error("content"), { status: 422 }); });
    await expect(만들기(길(), fake)(부탁)).rejects.toThrow("이미지를 생성하지 못했습니다 (422).");
  });

  it("우리 쪽 상한을 넘기면 「너무 오래」", async () => {
    let clock = 0;
    const ops: FalQueueOps = { status: async () => "in_progress", result: async () => ({}), cancel: async () => {} };
    const generate = 만들기(길(), { opsFor: () => ops, sleep: async () => { clock += 100_000; }, now: () => clock });
    await expect(generate(부탁)).rejects.toThrow("이미지 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.");
  });

  it("상태 코드가 없는 실패(네트워크)는 원래 예외 그대로", async () => {
    const router = 길(async () => { throw new TypeError("fetch failed"); });
    await expect(만들기(router)(부탁)).rejects.toThrow(TypeError);
  });
});
