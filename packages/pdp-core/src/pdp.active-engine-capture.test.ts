import { describe, expect, it } from "vitest";
import { DESIGN_SYSTEM_MARKER } from "./pdp.design-system";
import { DEFAULT_IMAGE_MODEL } from "./types";
import { PdpService } from "./pdp.service";
import { generateKeyVisual } from "./pdp.text-plan";

/**
 * **활성 엔진이 실제로 내보내는 것을 받아 적는다**(X-05 · X-08).
 *
 * ── X-05: 죽은 프롬프트를 재는 시험 ─────────────────────────
 *
 * 설계 §14.6: 「**죽은 프롬프트 시험** | 활성 엔진의 prompt/reference capture
 * 시험」.
 *
 * D-10 에서 호출 그래프를 훑어 보니 **지울 것이 없었다** — 죽은 줄 알았던
 * 조립기가 다 살아 있었다. 그러니 남은 일은 반대쪽이다: 시험이 **실제로 나가는
 * 것**을 재고 있는가.
 *
 * 조립기를 직접 불러 문자열을 보는 시험은 많다. 그런데 그것이 **그대로 나가는지**
 * 는 아무도 안 봤다 — 조립기는 맞는데 서비스가 안 부르면 시험은 초록이다.
 * 여기서는 `analyzeProduct` 를 **실제로 돌려** 모델에 간 것을 받아 적는다.
 *
 * ── X-08: 고친 것이 되돌아가지 않았는가 ────────────────────
 *
 * 설계 §14.6: 「과거 수정 완료 항목(style guide 중복, key visual 모델, 참조
 * 크기 체인) | **미해결로 다시 세지 않고 회귀 확인**」.
 *
 * 셋 다 이미 고쳐져 있다. 다시 세지 않고, **되돌아가면 빨개지도록** 잠근다.
 */

const 설계도 = JSON.stringify({
  executiveSummary: "", scorecard: [], blueprintList: [],
  // 실제 모양 그대로. 팔레트는 배열이고, 아무 칸도 안 차면 공용 디자인이
  // 통째로 `undefined` 가 된다(`normalizeDesignSystem`).
  designSystem: { headlineFont: "고딕", bodyFont: "본명조", palette: ["#112233", "#FFFFFF"], cast: "" },
  sections: [
    { section_id: "S1", section_name: "첫", headline: "제목", prompt_en: "a", layout_notes: "" },
    { section_id: "S2", section_name: "둘", headline: "제목2", prompt_en: "b", layout_notes: "" },
  ],
});

/** 모델에 간 것을 그대로 모은다. */
function 받아적기() {
  const 요청들: Array<Record<string, unknown>> = [];
  return {
    요청들,
    llm: {
      generate: async (request: Record<string, unknown>) => {
        요청들.push(request);
        return { text: 설계도 };
      },
    },
  };
}

/** 그 요청에 실린 글 전부. */
const 글 = (request: Record<string, unknown>) => JSON.stringify(request);

const 그림 = { imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "3:4" as const };
const 그린다 = { generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) };

const 돌리기 = async (request: Record<string, unknown> = {}) => {
  const { 요청들, llm } = 받아적기();
  const result = await new PdpService().analyzeProduct(
    { ...그림, ...request } as never,
    { llm, ...그린다 } as never,
    { skipFirstImage: true },
  );
  return { 요청들, result };
};

describe("기획 호출이 실제로 나간다", () => {
  it("**설계도를 짓는 호출이 한 번은 나간다**", async () => {
    const { 요청들 } = await 돌리기();

    expect(요청들.length).toBeGreaterThan(0);
    expect(요청들.some((request) => String(request.name ?? "").includes("blueprint"))).toBe(true);
  });

  /**
   * 조립기(`buildAnalyzePrompt`)를 직접 부르는 시험은 일곱이나 있는데,
   * **그것이 그대로 나가는지**는 아무도 안 봤다. 서비스가 다른 글을 보내도
   * 그 일곱은 초록이다.
   */
  it("**조립기가 만든 규칙이 그대로 실려 나간다**", async () => {
    const { 요청들 } = await 돌리기();
    const 나간글 = 요청들.map(글).join(" ");

    expect(나간글).toContain("상세페이지");
    // 근거 규칙은 이 경로의 핵심이다. 빠지면 없는 사실이 조용히 생긴다.
    expect(나간글).toContain("근거");
  });

  /**
   * **참조는 차례가 뜻이다.** 제품이 첫 그림이어야 프롬프트의 「이 제품」이
   * 가리키는 것이 어긋나지 않는다.
   */
  it("**제품 그림이 먼저 간다**", async () => {
    const { 요청들 } = await 돌리기({
      styleReference: { imageBase64: "UkVG", mimeType: "image/png" },
    });
    const 설계도호출 = 요청들.find((request) => String(request.name ?? "").includes("blueprint"))!;
    const 실린순서 = 글(설계도호출);

    expect(실린순서.indexOf("iVBORw0KGgo=")).toBeGreaterThan(-1);
    expect(실린순서.indexOf("iVBORw0KGgo=")).toBeLessThan(실린순서.indexOf("UkVG"));
  });

  it("**안 붙인 참조는 안 나간다**", async () => {
    const { 요청들 } = await 돌리기();

    expect(요청들.map(글).join(" ")).not.toContain("UkVG");
  });
});

/**
 * **① 공용 디자인이 섹션마다 따로 놀지 않는다**(X-08).
 *
 * 전에는 사진 경로가 섹션마다 `style_guide` 를 따로 썼다. 새 섹션을 더하면
 * 형제 것을 통째로 베꼈고, 그 형제를 고치면 둘이 갈렸다. 지금은 공용 디자인을
 * 모든 섹션에 같은 값으로 실어 준다.
 */
describe("고친 것이 되돌아가지 않았다", () => {
  it("**모든 섹션이 같은 공용 디자인을 단다**", async () => {
    const { result } = await 돌리기();
    const 표식들 = result.blueprint.sections.map((section) =>
      (section.style_guide ?? "").includes(DESIGN_SYSTEM_MARKER),
    );

    expect(result.blueprint.sections.length).toBeGreaterThan(1);
    expect(표식들.every(Boolean)).toBe(true);
  });

  it("**섹션마다 다른 값을 쓰지 않는다**", async () => {
    const { result } = await 돌리기();
    const 실린것 = new Set(result.blueprint.sections.map((section) => section.style_guide ?? ""));

    // 공용이라는 말은 하나라는 뜻이다.
    expect(실린것.size).toBe(1);
  });

  /**
   * **② 대표 이미지도 섹션과 같은 모델로 만든다.**
   *
   * 톤이 이어지려면 같은 모델이어야 한다. 전에는 여기만 다른 모델로 갔다.
   */
  it("**대표 이미지가 고른 모델로 간다**", async () => {
    const 쓴모델: string[] = [];
    await generateKeyVisual(
      {
        brief: { offeringName: "비누", outcome: "", tone: "" },
        blueprint: { sections: [{ section_id: "S1", prompt_en: "a" }] },
        aspectRatio: "3:4",
        imageModel: "gpt-image-2",
      } as never,
      {
        generateImage: async (_prompt: string, _ratio: string, model: string) => {
          쓴모델.push(model);
          return { base64: "AAA", mimeType: "image/png" };
        },
      } as never,
    );

    expect(쓴모델).toEqual(["gpt-image-2"]);
  });

  it("**안 고르면 기본 모델이다** — 아무 모델이나 쓰지 않는다", async () => {
    const 쓴모델: string[] = [];
    await generateKeyVisual(
      {
        brief: { offeringName: "비누", outcome: "", tone: "" },
        blueprint: { sections: [{ section_id: "S1", prompt_en: "a" }] },
        aspectRatio: "3:4",
      } as never,
      {
        generateImage: async (_prompt: string, _ratio: string, model: string) => {
          쓴모델.push(model);
          return { base64: "AAA", mimeType: "image/png" };
        },
      } as never,
    );

    expect(쓴모델).toEqual([DEFAULT_IMAGE_MODEL]);
  });
});
