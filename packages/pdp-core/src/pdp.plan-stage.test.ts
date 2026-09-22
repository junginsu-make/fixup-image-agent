import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";
import { PLAN_STAGE_LABEL, PLAN_STAGE_STEP, PLAN_STAGES, isPlanStage } from "./pdp.plan-stage";
import type { PdpPlanStage } from "./pdp.plan-stage";
import { REVIEW_CRITERIA } from "./pdp.review";

/**
 * **기획이 어디쯤인지 실제로 알린다**(2026-09-22 사용자 요청).
 *
 * ── 무엇을 원했나 ──────────────────────────────────────────
 *
 * 「생성중이라고 표시는 정확히 되고 있는데 여기서 일정 시간이나 정확한 흐름
 * 파악이 된다면 **검수 중**이라고도 표시 했으면 좋겠어요. 사용자가 막연하게
 * 너무 지루하게 기다리기만 합니다.」
 *
 * ── 왜 실제로 알리는가 ─────────────────────────────────────
 *
 * 시간으로 세면 **틀린다.** 모델이 늦으면 아직 구성안을 짜는 중인데 화면은
 * 「검수 중」이라고 말한다. 그래서 **넘어갈 때 코어가 말하게** 한다.
 *
 * 이 시험이 재는 것은 하나다 — **한 일과 알린 말이 같은가.**
 */

const 구성안 = {
  executiveSummary: "요약",
  scorecard: [],
  blueprintList: [],
  sections: [
    {
      section_id: "s1",
      section_name: "히어로",
      goal: "관심",
      headline: "",
      subheadline: "",
      bullets: [],
      trust_or_objection_line: "",
      CTA: "",
      prompt_ko: "",
      prompt_en: "a product",
      layout_notes: "",
    },
  ],
};

/** 모든 항목이 통과인 온전한 심사. 이러면 고쳐 쓸 일이 없다. */
const 통과심사 = {
  items: REVIEW_CRITERIA.map((criterion) => ({
    criterion: criterion.id,
    rating: "pass",
    evidence: "괜찮다",
    fix: "",
  })),
};

/**
 * 부르는 차례대로 답을 돌려준다.
 *
 * 구성안과 심사가 **같은 함수**를 거치므로, 무엇을 돌려줄지는 순서로 정한다.
 */
const 돌리기 = async (답들: unknown[], request: Record<string, unknown> = {}) => {
  const 알린것: PdpPlanStage[] = [];
  let 차례 = 0;
  const llm = {
    generate: async () => ({ text: JSON.stringify(답들[Math.min(차례++, 답들.length - 1)]) }),
  };

  const 결과 = await new PdpService().analyzeProduct(
    { imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "3:4", ...request } as never,
    { llm, generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) } as never,
    { skipFirstImage: true, onStage: (stage: PdpPlanStage) => alert알림(알린것, stage) },
  );

  return { 알린것, 결과 };
};

const alert알림 = (모은곳: PdpPlanStage[], stage: PdpPlanStage) => {
  모은곳.push(stage);
};

describe("이름과 말", () => {
  it("**모든 자리에 사용자에게 할 말이 있다**", () => {
    for (const stage of PLAN_STAGES) {
      expect(PLAN_STAGE_LABEL[stage]?.trim().length, `${stage} 에 할 말이 없다`).toBeGreaterThan(0);
      expect(PLAN_STAGE_STEP[stage]?.trim().length, `${stage} 에 차례표 이름이 없다`).toBeGreaterThan(0);
    }
  });

  it("**「검수」라는 말이 실제로 쓰인다** — 사용자가 이 낱말을 원했다", () => {
    expect(PLAN_STAGE_LABEL.review).toContain("검수");
    expect(PLAN_STAGE_LABEL.recheck).toContain("검수");
  });

  /** 화면 문구에는 줄표를 쓰지 않는다(저장소 규칙). */
  it("**줄표가 없다**", () => {
    for (const stage of PLAN_STAGES) {
      expect(PLAN_STAGE_LABEL[stage], `${stage}`).not.toContain("—");
      expect(PLAN_STAGE_STEP[stage], `${stage}`).not.toContain("—");
    }
  });

  it("**모르는 이름은 안 받는다**", () => {
    expect(isPlanStage("review")).toBe(true);
    expect(isPlanStage("검수")).toBe(false);
    expect(isPlanStage(undefined)).toBe(false);
  });
});

describe("한 일과 알린 말이 같다", () => {
  /**
   * **심사가 온전치 않으면 고쳐 쓴다.** 구성안 JSON 을 심사라고 주면 항목이
   * 하나도 없어 `needsRevision` 이 참이 된다. 그래서 네 자리를 다 지난다.
   */
  it("**고쳐 쓸 때는 다섯 자리를 순서대로 알린다**", async () => {
    const { 알린것 } = await 돌리기([구성안]);

    expect(알린것).toEqual(["blueprint", "review", "revise", "recheck", "finish"]);
  });

  /**
   * **안 한 일을 알리지 않는다.** 심사가 통과하면 고쳐 쓰기는 일어나지
   * 않는다. 그때 「고쳐 쓰는 중」이 뜨면 사용자는 없는 일을 기다린다.
   */
  it("**통과하면 고쳐 쓰기를 안 알린다**", async () => {
    const { 알린것 } = await 돌리기([구성안, 통과심사]);

    expect(알린것).toEqual(["blueprint", "review", "finish"]);
    expect(알린것).not.toContain("revise");
    expect(알린것).not.toContain("recheck");
  });

  /**
   * **인물 사진을 읽는 것도 기다림이다.** 레퍼런스를 올린 사람은 그만큼 더
   * 기다리는데, 그 시간이 어디로 갔는지 안 보이면 멈춘 것처럼 읽힌다.
   */
  it("**인물 사진을 올렸으면 그 자리를 맨 앞에 알린다**", async () => {
    // 인물 프로필 추출이 모델을 한 번 더 부른다. 그 답을 맨 앞에 끼운다.
    const { 알린것 } = await 돌리기([{ gender: "female" }, 구성안, 통과심사], {
      modelImageBase64: "iVBORw0KGgo=",
      modelImageMimeType: "image/png",
    });

    expect(알린것).toEqual(["reference", "blueprint", "review", "finish"]);
  });

  it("**안 올렸으면 그 자리는 없다**", async () => {
    const { 알린것 } = await 돌리기([구성안, 통과심사]);

    expect(알린것).not.toContain("reference");
  });
});

/**
 * **알리는 일 때문에 기획이 죽으면 안 된다.**
 *
 * 이 저장소가 심사·재작성에 이미 같은 그물을 쳤다 — 「덤 때문에 생성 자체가
 * 죽으면 손해가 더 크다」. 진행 표시는 덤 중의 덤이다.
 */
describe("알리다 터져도 기획은 끝난다", () => {
  it("**듣는 쪽이 던져도 결과가 나온다**", async () => {
    const llm = { generate: async () => ({ text: JSON.stringify(구성안) }) };

    const 결과 = await new PdpService().analyzeProduct(
      { imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "3:4" } as never,
      { llm, generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) } as never,
      {
        skipFirstImage: true,
        onStage: () => {
          throw new Error("듣는 쪽이 터졌다");
        },
      },
    );

    expect(결과.blueprint.sections.length).toBeGreaterThan(0);
  });

  it("**안 넘겨도 돈다** — 알림은 있으면 쓰는 것이다", async () => {
    const llm = { generate: async () => ({ text: JSON.stringify(구성안) }) };

    const 결과 = await new PdpService().analyzeProduct(
      { imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "3:4" } as never,
      { llm, generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) } as never,
      { skipFirstImage: true },
    );

    expect(결과.blueprint.sections.length).toBeGreaterThan(0);
  });
});
