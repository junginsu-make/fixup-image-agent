import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";

import type { SectionBlueprint } from "./types";
import { productFidelitySystemLine } from "./pdp.product-fidelity";
function section(): SectionBlueprint {
  return {
    section_id: "S1", section_name: "히어로", goal: "",
    headline: "촉촉함", headline_en: "", subheadline: "", subheadline_en: "",
    bullets: [], bullets_en: [], trust_or_objection_line: "", trust_or_objection_line_en: "",
    CTA: "", CTA_en: "", layout_notes: "", compliance_notes: "",
    image_id: "IMG_S1", purpose: "", prompt_ko: "제품 클로즈업", prompt_en: "product close-up",
    negative_prompt: "", style_guide: "", reference_usage: "",
  };
}

/**
 * 업로드 사진 경로는 생성 뒤 얼굴 일치 검사를 돌린다. 여기서는 "같은
 * 사람으로 나왔다"만 흉내 내서 재시도 없이 한 번에 끝나게 한다.
 */
const passingClient = {
  models: {
    generateContent: async () => ({
      text: JSON.stringify({
        isSamePerson: true,
        genderPresentationPreserved: true,
        styleMatch: true,
        confidence: "high",
        reason: "",
        correctionFocus: [],
      }),
    }),
  },
};

import { readFileSync } from "node:fs";
import { buildSceneWithCharacterDirective } from "./pdp.character";
import { characterAngleDirective } from "@fixup/shared";
import { buildAttachmentRoleDirective as redesignRoles } from "../../redesign-core/src/generate";

/**
 * **사람 캐릭터의 프롬프트는 한 글자도 안 바뀐다**(2026-10-07 독립 리뷰, ③).
 *
 * `__fixtures__/character-carry-baseline.json` 은 이 변경 **전** 커밋(c4578e7e)이 낸
 * 출력이다. 새 코드끼리 비교하면 둘이 함께 바뀌어도 못 잡는다 — 리뷰가 실제로
 * 그것을 잡았다(「참고 그림 따라 만들기」 사람 캐릭터에 그림체 예외가 붙었다).
 */
const baseline = JSON.parse(
  readFileSync(new URL("./__fixtures__/character-carry-baseline.json", import.meta.url), "utf8"),
) as Record<string, { prompt: string; systemPrompt: string }> & {
  scene: { withStyle: string; alone: string };
  angle3: string;
  redesign: string;
};

/**
 * 이 고정본은 **제품 보존 블록(2026-10-08)이 생기기 전** 출력이다. 그 블록은 일부러
 * 새로 들어갔으므로 비교 전에 걷어 낸다 — 걷어 내고도 같아야 「사람 캐릭터 문장은
 * 한 글자도 안 바뀐다」가 계속 참이다. 블록 자체는 pdp.product-fidelity-wiring.test.ts 가 잰다.
 */
function withoutProductBlock(captured: { prompt: string; systemPrompt: string }) {
  return {
    prompt: captured.prompt
      .split("\n\n")
      .filter((paragraph) => !paragraph.startsWith("PRODUCT FIDELITY") && !paragraph.startsWith("Final check:"))
      .join("\n\n"),
    // 어느 제품 줄이 붙었든(보존·shape-only) 걷어 낸다 — 한쪽만 걷으면 다른 쪽이 붙은 경우를 「바뀌었다」로 잘못 읽는다.
    systemPrompt: (["identity", "shape-only"] as const).reduce(
      (text, role) => text.replace(` ${productFidelitySystemLine(role)}`, ""),
      captured.systemPrompt,
    ),
  };
}

async function capture(options: Record<string, unknown>) {
  const service = new PdpService();
  let prompt = "";
  let systemPrompt = "";
  await (service as never as {
    generateSectionImageInternal: (request: unknown) => Promise<unknown>;
  }).generateSectionImageInternal({
    originalImageBase64: "iVBORw0KGgo=",
    section: section(),
    aspectRatio: "3:4",
    options: { style: "studio", withModel: false, outputMode: "editable", ...options },
    client: passingClient,
    generateImage: async (_model: string, input: { prompt: string; systemPrompt?: string }) => {
      prompt = input.prompt;
      systemPrompt = input.systemPrompt ?? "";
      return { base64: "IMG", mimeType: "image/jpeg" };
    },
  });
  return withoutProductBlock({ prompt, systemPrompt });
}

type Extra = Record<string, unknown>;
const view = (base64: string, identityPrompt: string, extra: Extra) => ({ base64, mimeType: "image/png", identityPrompt, ...extra });

function cases(extra: Extra): Record<string, Record<string, unknown>> {
  return {
    oneView: { withModel: true, characterReferences: [view("BBBB", "20대 한국 여성", extra)] },
    threeViewsStyleInstruction: {
      withModel: true,
      userInstruction: "왼쪽에 놓아 주세요",
      attachmentIntents: { person: "안경을 꼭 씌워 주세요" },
      styleReferenceImages: [{ base64: "SSSS", mimeType: "image/png" }],
      characterReferences: [
        view("B1", "a woman with short hair", extra),
        view("B2", "a woman with short hair", extra),
        view("B3", "a woman with short hair", extra),
      ],
    },
    paddedIdentity: { withModel: true, characterReferences: [view("BBBB", "a woman \n", extra)] },
    modelOff: { withModel: false, characterReferences: [view("BBBB", "20대 한국 여성", extra)] },
    animePage: { withModel: true, look: "anime", characterReferences: [view("BBBB", "a boy", extra)] },
  };
}

describe.each([
  ["종류·그림체를 안 준 옛 호출", {}],
  ["사람 + 실사", { kind: "person", look: "photoreal" }],
  ["사람 + 참고 그림 따라 만들기(auto) — 참고 그림이 사진일 수 있다", { kind: "person", look: "auto" }],
])("변경 전과 같다 — %s", (_name, extra) => {
  for (const [name, options] of Object.entries(cases(extra as Extra))) {
    it(name, async () => {
      const now = await capture(options);
      expect(now.prompt).toBe(baseline[name]!.prompt);
      expect(now.systemPrompt).toBe(baseline[name]!.systemPrompt);
    });
  }
});

describe("변경 전과 같다 — 리디자인·각도 문장", () => {
  it("리디자인 섹션 지시(사람·실사, 사람·auto, 종류 없음)", () => {
    for (const extra of [{}, { kind: "person" as const, look: "photoreal" as const }, { kind: "person" as const, look: "auto" as const }]) {
      expect(buildSceneWithCharacterDirective({ identityPrompt: "단발", hasStyleReference: true, ...extra })).toBe(baseline.scene.withStyle);
      expect(buildSceneWithCharacterDirective({ identityPrompt: "단발", hasStyleReference: false, ...extra })).toBe(baseline.scene.alone);
    }
  });

  it("여러 각도 문장(사람)", () => {
    expect(characterAngleDirective(3)).toBe(baseline.angle3);
    expect(characterAngleDirective(3, "person")).toBe(baseline.angle3);
  });

  it("리디자인 첨부 이름표(사람)", () => {
    expect(redesignRoles({ originalCount: 2, characterCount: 3 })).toBe(baseline.redesign);
    expect(redesignRoles({ originalCount: 2, characterCount: 3, characterKind: "person" })).toBe(baseline.redesign);
  });
});
