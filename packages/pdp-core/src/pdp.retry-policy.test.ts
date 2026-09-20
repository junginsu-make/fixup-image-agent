import { describe, expect, it } from "vitest";
import { isRetriableModelFailure } from "./pdp.retry-policy";
import { PdpService, PdpServiceError } from "./pdp.service";

/**
 * **다시 물으면 될 일을 한 번에 포기했다**(D-3 · D-6).
 *
 * 모델이 JSON 대신 말을 섞어 보내거나 섹션을 하나도 안 주면, 다시 묻는 것이
 * 맞다. 그러라고 재시도 장치가 있었다. 그런데 **아무것도 그 장치에 닿지
 * 못했다.**
 *
 * ── 두 군데가 어긋나 있었다 ─────────────────────────────────
 *
 * **① 호출 층(D-6).** 재시도 여부를 `error.message` 로 정했다 — 「JSON」·
 * 「Unexpected token」 같은 엔진 글자를 찾는다. 그런데 설계도 파싱은 그 오류를
 * 잡아 **한국어 문장으로 바꿔** 던진다(「AI 응답을 해석하지 못했습니다.」).
 * 찾는 글자가 사라졌으니 한 번도 안 걸렸다.
 *
 * **② 라우트 층(D-3).** 「INVALID_REQUEST 이고 detail 에 section 이 있으면」
 * 다시 부르게 돼 있었다. 그런데 분석 경로가 그 코드를 **던지는 자리가 없다** —
 * 섹션이 비면 `AI_RESPONSE_INVALID` 다. 코드가 안 맞아 역시 한 번도 안 걸렸다.
 *
 * 설계 §14.4: D-3 「analyze 재시도 오류 코드 불일치」, D-6 「JSON 재시도를
 * 한국어 오류 문자열에서 찾음 → **오류 코드 기반으로** 수정」.
 */

describe("무엇을 다시 물어볼 것인가", () => {
  it("**모델이 못 쓴 답은 다시 묻는다**", () => {
    expect(isRetriableModelFailure("AI_RESPONSE_INVALID")).toBe(true);
  });

  it.each([
    ["AI_KEY_MISSING", "키는 다시 물어도 안 생긴다"],
    ["AI_KEY_INVALID", "같다"],
    ["AI_MODEL_ACCESS_DENIED", "권한은 다시 물어도 안 생긴다"],
    ["INVALID_IMAGE_PAYLOAD", "같은 그림을 또 보내도 같다"],
    ["INVALID_REQUEST", "요청이 틀린 것은 우리 쪽 문제다"],
    ["TEXT_INPUT_INSUFFICIENT", "모델이 읽고 내린 판단이다. 또 읽어도 같다"],
    ["PDP_IMAGE_QA_REJECTED", "검수가 내린 판단이다. 재시도는 그쪽 규칙이 따로 한다"],
  ])("%s 는 다시 묻지 않는다 (%s)", (code) => {
    expect(isRetriableModelFailure(code)).toBe(false);
  });

  /**
   * **모르는 코드는 안 묻는다.** 넓히면 돈이 나간다 — 다시 부르는 것은 공짜가
   * 아니다. 한도 면제(`pdp.analysis-quota`)와 반대 방향의 기본값이다.
   */
  it("**모르는 코드는 다시 묻지 않는다**", () => {
    expect(isRetriableModelFailure("무슨코드")).toBe(false);
    expect(isRetriableModelFailure(undefined)).toBe(false);
  });
});

/**
 * **실제로 다시 묻는지 돌려서 본다.**
 *
 * 정책만 맞고 배선이 안 됐으면 아무 소용이 없다. 이 저장소가 이미 두 번 그랬다.
 */
describe("실행해 보면 다시 묻는다", () => {
  const 그림 = { imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "3:4" } as never;
  const 그린다 = { generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) };
  const 온전한설계도 = JSON.stringify({
    executiveSummary: "", scorecard: [], blueprintList: [],
    sections: [{ section_id: "S1", headline: "제목", prompt_en: "a", layout_notes: "" }],
  });

  /** `retryOperation` 의 기다림을 건너뛴다. 시험이 4.5초를 쉴 이유가 없다. */
  const 빠르게 = async <T>(run: () => Promise<T>) => {
    const sleep = globalThis.setTimeout;
    (globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void) => sleep(fn, 0)) as never;
    try {
      return await run();
    } finally {
      (globalThis as { setTimeout: unknown }).setTimeout = sleep;
    }
  };

  it("**말이 섞여 들어오면 한 번 더 묻는다**", async () => {
    const 답: string[] = ["죄송합니다. 설계도를 만들지 못했습니다.", 온전한설계도];
    let 부른횟수 = 0;
    const llm = { generate: async () => ({ text: 답[부른횟수++] ?? 온전한설계도 }) };

    const result = await 빠르게(() =>
      new PdpService().analyzeProduct(그림, { llm, ...그린다 } as never, { skipFirstImage: true }),
    );

    expect(부른횟수).toBeGreaterThanOrEqual(2);
    expect(result.blueprint.sections).toHaveLength(1);
  });

  /**
   * **섹션이 하나도 없으면 다시 묻는다.**
   *
   * 전에는 이 판정이 재시도 바깥에 있어서, 빈 답이 오면 그대로 끝났다.
   */
  it("**빈 설계도도 한 번 더 묻는다**", async () => {
    const 빈것 = JSON.stringify({ executiveSummary: "", scorecard: [], blueprintList: [], sections: [] });
    const 답: string[] = [빈것, 온전한설계도];
    let 부른횟수 = 0;
    const llm = { generate: async () => ({ text: 답[부른횟수++] ?? 온전한설계도 }) };

    const result = await 빠르게(() =>
      new PdpService().analyzeProduct(그림, { llm, ...그린다 } as never, { skipFirstImage: true }),
    );

    expect(부른횟수).toBeGreaterThanOrEqual(2);
    expect(result.blueprint.sections).toHaveLength(1);
  });

  it("**끝까지 못 쓰면 그 코드로 끝난다** — 무한히 묻지 않는다", async () => {
    let 부른횟수 = 0;
    const llm = { generate: async () => { 부른횟수 += 1; return { text: "끝내 JSON 이 아닙니다" }; } };

    await expect(
      빠르게(() => new PdpService().analyzeProduct(그림, { llm, ...그린다 } as never, { skipFirstImage: true })),
    ).rejects.toMatchObject({ code: "AI_RESPONSE_INVALID" });

    // 재시도는 두 번까지다. 세 번을 넘게 부르면 값이 그만큼 나간다.
    expect(부른횟수).toBeLessThanOrEqual(3);
  });
});

/**
 * **재작성이 실패하면 멀쩡한 설계도까지 버렸다**(리뷰 HIGH-1).
 *
 * 빈 섹션 판정을 파싱 자리로 옮기면서 생긴 회귀다. 재작성 호출에는 try/catch 가
 * 없어서, 두 번째 요청이 빈 답을 주면 **첫 번째로 이미 받아 둔 설계도까지 같이
 * 죽는다.**
 *
 * 바로 위 심사(`runReview`)는 같은 상황을 일부러 삼킨다 — 「심사 때문에 생성
 * 자체가 죽으면 손해가 더 크다」. 재작성도 같은 결이어야 한다: **고치기가
 * 실패하면 안 고친 것과 같은 상태**로 둔다.
 */
describe("재작성이 실패해도 앞의 것을 지킨다", () => {
  const 그림 = { imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "3:4" } as never;
  const 그린다 = { generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) };

  const 설계도 = (headline: string) => JSON.stringify({
    executiveSummary: "", scorecard: [], blueprintList: [],
    sections: [{ section_id: "S1", headline, prompt_en: "a", layout_notes: "" }],
  });
  /** 재작성을 부르게 만드는 심사 결과. */
  const 나쁜심사 = JSON.stringify({
    items: [{ id: "headline", verdict: "fail", reason: "약하다" }],
  });
  const 빈설계도 = JSON.stringify({ executiveSummary: "", scorecard: [], blueprintList: [], sections: [] });

  const 빠르게 = async <T>(run: () => Promise<T>) => {
    const sleep = globalThis.setTimeout;
    (globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void) => sleep(fn, 0)) as never;
    try {
      return await run();
    } finally {
      (globalThis as { setTimeout: unknown }).setTimeout = sleep;
    }
  };

  it("**재작성이 끝내 빈 답이어도 첫 설계도로 끝낸다**", async () => {
    const llm = {
      generate: async (request: { name?: string }) => {
        // 심사 호출과 설계도 호출을 이름으로 가른다.
        if (String(request?.name ?? "").includes("review")) return { text: 나쁜심사 };
        return { text: 처음인가() ? 설계도("첫 제목") : 빈설계도 };
      },
    };
    let 설계도호출 = 0;
    const 처음인가 = () => ++설계도호출 === 1;

    const result = await 빠르게(() =>
      new PdpService().analyzeProduct(그림, { llm, ...그린다 } as never, { skipFirstImage: true }),
    );

    expect(result.blueprint.sections).toHaveLength(1);
    expect(result.blueprint.sections[0]!.headline).toBe("첫 제목");
  });

  /**
   * **재작성은 한 번만 묻는다.**
   *
   * 설계도 호출 하나가 60~110초다. 재시도(3회) × 재작성(2번 호출) = 여섯 번이면
   * 라우트 상한(300초)을 넘고, 그때는 정산이 아예 안 돌아 예약이 묶인 채 남는다.
   * 재작성은 **덤**이므로 실패하면 그냥 안 고친다.
   */
  it("**재작성은 되묻지 않는다** — 덤에 값을 세 배로 쓰지 않는다", async () => {
    let 설계도호출 = 0;
    const llm = {
      generate: async (request: { name?: string }) => {
        if (String(request?.name ?? "").includes("review")) return { text: 나쁜심사 };
        설계도호출 += 1;
        return { text: 설계도호출 === 1 ? 설계도("첫 제목") : 빈설계도 };
      },
    };

    await 빠르게(() =>
      new PdpService().analyzeProduct(그림, { llm, ...그린다 } as never, { skipFirstImage: true }),
    );

    // 첫 설계도 1회 + 재작성 1회. 재작성이 되물으면 4회가 된다.
    expect(설계도호출).toBe(2);
  });
});

/**
 * **fal 그림 한 장이 세 장 값이 됐다**(리뷰 HIGH-2).
 *
 * `retryOperation` 은 설계도만 감싸지 않는다 — **그림 만드는 호출도** 감싼다.
 * 그리고 `fal.ts` 는 「200 인데 몸통이 JSON 이 아니다」에 똑같이
 * `AI_RESPONSE_INVALID` 를 던진다.
 *
 * 코드로 재시도를 열자 그 길이 1회에서 **3회**가 됐다. fal 은 200 을 줬으니
 * **그 세 장은 이미 과금**됐고, 성공한 장수만 세는 장부에는 **0장**으로 남는다.
 * C-9 가 없애려던 바로 그 모양이다.
 *
 * 「같은 그림·같은 프롬프트로 다시 물으면 다른 답이 온다」는 근거는 **글
 * 모델에만** 참이다. 그래서 재시도 정책을 층별로 가른다.
 */
describe("그림 호출은 되묻지 않는다", () => {
  const 그림 = { imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "3:4" } as never;
  const 온전한설계도 = JSON.stringify({
    executiveSummary: "", scorecard: [], blueprintList: [],
    sections: [{ section_id: "S1", headline: "제목", prompt_en: "a", layout_notes: "" }],
  });

  const 빠르게 = async <T>(run: () => Promise<T>) => {
    const sleep = globalThis.setTimeout;
    (globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void) => sleep(fn, 0)) as never;
    try {
      return await run();
    } finally {
      (globalThis as { setTimeout: unknown }).setTimeout = sleep;
    }
  };

  it("**몸통을 못 읽어도 한 번만 그린다** — 이미 값을 치른 호출이다", async () => {
    let 그린횟수 = 0;
    const llm = { generate: async () => ({ text: 온전한설계도 }) };
    const generateImage = async () => {
      그린횟수 += 1;
      throw new PdpServiceError(
        "AI_RESPONSE_INVALID",
        "이미지 생성 응답을 해석하지 못했습니다.",
        "fal response was not valid JSON.",
      );
    };

    await expect(
      빠르게(() => new PdpService().analyzeProduct(그림, { llm, generateImage } as never)),
    ).rejects.toMatchObject({ code: "AI_RESPONSE_INVALID" });

    expect(그린횟수).toBe(1);
  });
});
