import { describe, expect, it } from "vitest";
import { isRetriableModelFailure } from "./pdp.retry-policy";
import { PdpService } from "./pdp.service";

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
