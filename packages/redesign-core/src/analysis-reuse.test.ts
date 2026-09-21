import { describe, expect, it, vi } from "vitest";
import { generateSections } from "./generate";

/**
 * **청크마다 분석을 다시 돌렸다**(F-7-7).
 *
 * 설계 §14.5: 「1장씩 분할로 **분석**·올림 반복 | **계획 1회** + 논리 작업
 * 정산, 개별 생성 resume」.
 *
 * 화면의 「나머지 섹션 생성」은 자기 자신을 한 장씩 다시 부른다. 그래서 여덟
 * 장 채우기는 **분석도 여덟 번** 돈다.
 *
 * 세 가지가 함께 나빠진다.
 *
 *   1. **값.** 글 모델 값이 여덟 배다. 원본과 전사를 통째로 다시 먹인다
 *   2. **시간.** 분석 한 번이 몇십 초다. 여덟 번이면 그만큼 기다린다
 *   3. **일관성.** 매번 새로 기획하므로 **청크마다 다른 계획**이 나온다.
 *      1~2장과 3~4장이 서로 다른 전략으로 그려진다
 *
 * 분석 결과는 이미 응답에 실려 돌아온다(`project.analysis`). 그것을 도로
 * 주면 다시 부를 까닭이 없다.
 */

const 이미지 = { name: "원본.png", type: "image/png", buffer: Buffer.from("AAA") };

const 입력 = (over: Record<string, unknown> = {}) => ({
  model: "openai", openaiKey: "sk-test", files: [이미지] as never,
  request: "밝게 바꿔 주세요", channel: "smartstore", ratio: "3:4",
  count: 1, startSection: 2,
  generateImage: async () => ({ buffer: Buffer.from("IMG"), mimeType: "image/png" }),
  ...over,
});

const 쓸만한분석 = {
  product_inferred: { category: "보습 크림", confidence: 0.8 },
  diagnostic_summary: "원본은 글자가 작다",
  strategy: "효능을 근거와 함께 앞세운다",
  page_blueprint: [{ section_id: "S1", name: "히어로" }],
  verified_facts: ["용량 50ml"],
};

/** 분석 호출이 몇 번 나가는지 센다. */
const 분석을센다 = () => {
  const 나간것: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    나간것.push(String(url));
    const body = JSON.stringify({ output_text: JSON.stringify(쓸만한분석) });
    return { ok: true, status: 200, headers: new Headers(), text: async () => body };
  });
  return 나간것;
};

describe("이미 한 기획을 다시 하지 않는다", () => {
  it("**분석을 주면 모델을 안 부른다**", async () => {
    const 나간것 = 분석을센다();

    try {
      await generateSections(입력({ analysis: 쓸만한분석 }) as never);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(나간것).toHaveLength(0);
  });

  it("**안 주면 전과 같이 분석한다**", async () => {
    const 나간것 = 분석을센다();

    try {
      await generateSections(입력() as never);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(나간것).toHaveLength(1);
  });

  /**
   * **준 것을 실제로 쓴다.** 부르지만 않고 버리면 계획이 빈 채로 그려진다.
   */
  it("**준 분석이 프롬프트에 실린다**", async () => {
    분석을센다();
    const 받은것: Array<{ prompt: string }> = [];

    try {
      await generateSections(입력({
        analysis: 쓸만한분석,
        generateImage: async (request: { prompt: string }) => {
          받은것.push(request);
          return { buffer: Buffer.from("IMG"), mimeType: "image/png" };
        },
      }) as never);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(받은것).toHaveLength(1);
    expect(받은것[0]!.prompt).toContain("효능을 근거와 함께 앞세운다");
  });

  /**
   * **쓸 만하지 않은 것은 안 믿는다.**
   *
   * 화면이 가진 사본이 낡았거나 비어 있을 수 있다. 그것을 그대로 쓰면
   * F-7-3 이 막은 「빈 분석으로 유료 생성」이 **뒷문으로 되살아난다.**
   */
  it.each([
    ["빈 객체", {}],
    ["빈 요약만", { summary: "" }],
    ["객체가 아님", "분석"],
    ["없음", null],
  ])("**%s 이면 믿지 않고 다시 분석한다**", async (_label, 준것) => {
    const 나간것 = 분석을센다();

    try {
      await generateSections(입력({ analysis: 준것 }) as never);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(나간것).toHaveLength(1);
  });
});
