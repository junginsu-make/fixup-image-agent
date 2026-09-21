import { describe, expect, it } from "vitest";
import { textPlanDepsFrom } from "./pdp.text-plan";
import { legacyClientForTest, toPdpErrorResponse } from "./pdp.service";
import type { PdpLlm, PdpLlmRequest } from "./pdp.llm";
import type { PdpProviders } from "./pdp.image-provider";

/**
 * **무슨 일을 하는 호출인지 코어가 밝힌다.**
 *
 * 길이 상한은 바깥(제공자)이 정한다 — 모델마다 다르기 때문이다. 그런데 코어가
 * `maxTokens: 8192` 를 손으로 실어 보내면 그 정책이 통째로 무시된다. 2026-09-17
 * 실호출 검증에서 텍스트 기획이 그 8192 에 걸려 잘렸다.
 *
 * 이름으로 짐작하게 두지도 않는다. 설계 §3 이 「알 수 없는 이름을 우연히 기획으로
 * 분류하지 않는다」고 못 박았다.
 */
function 기록하는통로() {
  const 요청들: PdpLlmRequest[] = [];
  const llm: PdpLlm = {
    async generate(request) {
      요청들.push(request);
      return { text: JSON.stringify({ sections: [] }) };
    },
  };
  const providers: PdpProviders = {
    llm,
    generateImage: async () => {
      throw new Error("이 시험은 그림을 만들지 않는다");
    },
  };
  return { llm, providers, 요청들 };
}

describe("기획 호출은 목적을 밝히고 길이를 제공자에게 맡긴다", () => {
  it("텍스트 경로의 기획·심사가 각자 목적을 싣는다", async () => {
    const { providers, 요청들 } = 기록하는통로();
    const deps = textPlanDepsFrom(providers);

    await deps.generateJson("프롬프트", {}, "pdp_blueprint");
    await deps.generateJson("프롬프트", {}, "pdp_review");

    expect(요청들[0]!.purpose).toBe("planning");
    expect(요청들[1]!.purpose).toBe("review");
  });

  it("코어가 길이 상한을 손으로 정하지 않는다", async () => {
    const { providers, 요청들 } = 기록하는통로();
    const deps = textPlanDepsFrom(providers);

    await deps.generateJson("프롬프트", {}, "pdp_blueprint");

    expect(요청들[0]!.maxTokens).toBeUndefined();
  });

  it("사진 경로의 구성안 호출도 같은 규칙을 따른다", async () => {
    const { providers, 요청들 } = 기록하는통로();
    const client = legacyClientForTest(providers.llm);

    await client.models.generateContent({
      name: "pdp_blueprint",
      contents: [{ parts: [{ text: "프롬프트" }] }],
      config: { responseSchema: {} },
    });

    expect(요청들[0]!.purpose).toBe("planning");
    expect(요청들[0]!.maxTokens).toBeUndefined();
  });
});

describe("잘린 답은 잘렸다고 알린다", () => {
  it("제공자가 던진 잘림을 「처리 중 오류」로 뭉개지 않는다", () => {
    const 잘림 = Object.assign(new Error("claude-fable-5 이(가) pdp_blueprint 답을 끝까지 쓰지 못하고 잘렸습니다."), {
      name: "PdpResponseTruncatedError",
    });

    const 봉투 = toPdpErrorResponse(잘림);

    expect(봉투.code).toBe("AI_RESPONSE_INVALID");
    expect(봉투.message).toMatch(/잘렸|줄여/);
  });
});
