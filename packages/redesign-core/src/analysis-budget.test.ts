import { describe, expect, it, vi } from "vitest";
import { generateSections } from "./generate";

/**
 * **두 코어가 예산 규칙을 따로 쓴다**(F-7-1).
 *
 * 설계 §14.6: 「별도 코어의 참조·검수·**예산**·근거 규칙 불일치 | **공통
 * 실행/검수 계약 공유**, 도메인 전체 병합은 하지 않음 | W3/W5/W8」.
 *
 * 상세페이지는 이렇다(`apps/web/lib/pdp/providers.ts`).
 *
 *   · 기획 호출 상한 32,768 · 그 밖 8,192
 *   · 모델이 끝까지 못 쓰면 `stop_reason === "max_tokens"` 를 보고
 *     `AI_RESPONSE_TRUNCATED` 로 **던진다**
 *
 * 리디자인은 **둘 다 없다.** 업체를 직접 부르면서 상한을 안 주고, 잘렸는지도
 * 안 본다.
 *
 * ── 왜 이것이 지금 더 나쁜가 ────────────────────────────────
 *
 * 잘린 응답은 JSON 이 안 닫힌다. `parseMaybeJson` 은 못 파싱하면
 * `{ summary: 조각난_글 }` 을 준다. 그러면 F-7-3 에서 넣은 `isUsableAnalysis`
 * 가 **그것을 쓸 만하다고 본다** — `summary` 에 글자가 있기 때문이다.
 *
 * 그래서 「빈 분석으로 유료 생성」을 막아 놓고도, **잘린 분석으로는 그대로
 * 유료 생성이 돈다.** 사용자는 앞부분만 읽은 페이지를 받고 값을 낸다.
 *
 * 2026-09-17 에 상세페이지 텍스트 기획이 111초를 쓰고 잘려 죽은 사고가 있었고,
 * W8 측정에서 대표 응답이 약 10,463토큰으로 나왔다
 * (`docs/bugs/pdp-validation/w8-measurements.md`). 리디자인 분석은 그보다
 * 길게 답한다 — `verified_facts` 만 최대 60개다.
 */

const 이미지 = { name: "원본.png", type: "image/png", buffer: Buffer.from("AAA") };

const 입력 = (over: Record<string, unknown> = {}) => ({
  model: "openai", openaiKey: "sk-test", files: [이미지] as never,
  request: "밝게 바꿔 주세요", channel: "smartstore", ratio: "3:4",
  count: 1, startSection: 1,
  generateImage: async () => ({ buffer: Buffer.from("IMG"), mimeType: "image/png" }),
  ...over,
});

/** 첫 호출(분석)만 주어진 몸통으로 답하고, 그 뒤는 멀쩡히 답한다. */
const 분석이 = (body: unknown) => {
  const 보낸것: unknown[] = [];
  let 호출수 = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    호출수 += 1;
    if (호출수 === 1) {
      보낸것.push(JSON.parse(String(init.body)));
      return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(body) };
    }
    const ok = JSON.stringify({ data: [{ b64_json: Buffer.from("AAA").toString("base64") }] });
    return { ok: true, status: 200, headers: new Headers(), text: async () => ok };
  });
  return 보낸것;
};

/** 끝까지 못 쓴 답. JSON 이 안 닫혀 있다. */
const 잘린답 = '{"product_inferred":{"category":"보습 크림"},"strategy":"효능을 근거와 함';

describe("잘린 분석으로 그리지 않는다", () => {
  /**
   * **OpenAI 는 잘렸다고 말해 준다.** Responses API 는 `status: "incomplete"`
   * 와 `incomplete_details.reason` 을 준다. 그것을 안 보면 조각난 글이 그대로
   * 계획이 된다.
   */
  it("**OpenAI 가 잘렸다고 하면 멈춘다**", async () => {
    분석이({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output_text: 잘린답,
    });
    const generateImage = vi.fn();

    try {
      await generateSections(입력({ generateImage }) as never).catch(() => {});

      expect(generateImage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** **Google 은 `finishReason` 으로 말한다.** 이름만 다르고 같은 일이다. */
  it("**Google 이 잘렸다고 하면 멈춘다**", async () => {
    분석이({
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: 잘린답 }] } }],
    });
    const generateImage = vi.fn();

    try {
      await generateSections(입력({ model: "google", googleKey: "g-test", generateImage }) as never)
        .catch(() => {});

      expect(generateImage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("**무엇이 문제인지 말한다** — 「잠시 후 다시」로는 못 고친다", async () => {
    분석이({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output_text: 잘린답,
    });

    try {
      const 오류 = await generateSections(입력() as never).catch((e: unknown) => e) as Error;

      expect(오류.message).toMatch(/끝까지/);
      // 사용자가 할 수 있는 일이어야 한다.
      expect(오류.message).toContain("원본 장수를 줄여");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * **모델 이름을 회원 화면에 띄우지 않는다.**
   *
   * 이 문구는 `RedesignError` → 라우트 → 위저드 토스트까지 한 번도 안 바뀌고
   * 간다. 처음 판은 `${model}` 을 그대로 실어 `gpt-5.5` 가 사용자에게 보였다
   * (2026-09-21 리뷰). 상세페이지는 같은 자리에서 공급자 문구를 **한 겹
   * 번역해서** 내보낸다 — 그 윗겹만 베꼈던 것이다.
   *
   * 소스 글자를 훑는 `model-name.test.ts` 는 이것을 못 잡는다. 보간이라
   * 소스에는 `${model}` 만 있다. **실제로 던져 보고 잰다.**
   */
  it.each([
    ["OpenAI", { model: "openai", openaiKey: "sk-test" }, {
      status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: 잘린답,
    }],
    ["Google", { model: "google", googleKey: "g-test" }, {
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: 잘린답 }] } }],
    }],
  ])("**%s 잘림 문구에 모델 이름이 없다**", async (_label, over, body) => {
    분석이(body);

    try {
      const 오류 = await generateSections(입력(over as never) as never).catch((e: unknown) => e) as Error;

      for (const 이름조각 of ["gpt-", "gemini", "claude", "preview", "flare"]) {
        expect(오류.message.toLowerCase(), `${이름조각} 이 사용자 문구에 있다`)
          .not.toContain(이름조각);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * **`MAX_TOKENS` 만 보면 모자란다.**
   *
   * Google 이 `SAFETY`·`RECITATION` 으로 중간에 멈춰도 앞부분 글이 남는다.
   * 그러면 `isUsableAnalysis` 가 통과시켜, **이름만 바꾼 같은 구멍**이 된다.
   */
  it.each([["SAFETY"], ["RECITATION"], ["OTHER"]])(
    "**Google 이 %s 로 멈춰도 그리지 않는다**",
    async (finishReason) => {
      분석이({ candidates: [{ finishReason, content: { parts: [{ text: 잘린답 }] } }] });
      const generateImage = vi.fn();

      try {
        await generateSections(입력({ model: "google", googleKey: "g-test", generateImage }) as never)
          .catch(() => {});

        expect(generateImage).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("**길이 때문이 아니면 줄이라고 하지 않는다** — 줄인다고 되는 일이 아니다", async () => {
    분석이({ candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: 잘린답 }] } }] });

    try {
      const 오류 = await generateSections(입력({ model: "google", googleKey: "g-test" }) as never)
        .catch((e: unknown) => e) as Error;

      expect(오류.message).not.toContain("장수를 줄여");
      expect(오류.message).toContain("다른 자료로");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("**정상(STOP)은 그대로 지나간다**", async () => {
    분석이({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"strategy":"좋다"}' }] } }],
    });
    const generateImage = vi.fn(async () => ({ buffer: Buffer.from("IMG"), mimeType: "image/png" }));

    try {
      await generateSections(입력({ model: "google", googleKey: "g-test", generateImage }) as never);

      expect(generateImage).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("**끝났다는 표시가 아예 없으면 지나간다** — 모르는 모양에 문을 닫지 않는다", async () => {
    분석이({ output_text: '{"strategy":"좋다"}' });
    const generateImage = vi.fn(async () => ({ buffer: Buffer.from("IMG"), mimeType: "image/png" }));

    try {
      await generateSections(입력({ generateImage }) as never);

      expect(generateImage).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
