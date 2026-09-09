import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";
import { buildReferenceRoleDirective, isIdentityReference } from "./pdp.reference-policy";
import type { ReferenceImage, SectionBlueprint } from "./types";

/**
 * 참조 정책은 이 시스템의 필수 규칙이다(pdp.reference-policy.ts).
 *
 * 이미지는 **분석하지 않고 그대로 첨부**한다. 모델에게 알려야 하는 것은
 * "몇 번째 이미지가 무엇이고 어떻게 다루는가"뿐이다. fal 은 이미지별 역할 라벨을
 * 받지 않으므로(image_urls 배열) 프롬프트 문장이 유일한 전달 수단이다.
 */

const anchor: ReferenceImage = { kind: "anchor", base64: "A", mimeType: "image/png" };
const person: ReferenceImage = { kind: "person", base64: "P", mimeType: "image/png" };
const style: ReferenceImage = { kind: "style", base64: "S", mimeType: "image/png" };

describe("참조 등급", () => {
  it("제품과 인물은 그대로 지키는 등급이다", () => {
    expect(isIdentityReference("anchor")).toBe(true);
    expect(isIdentityReference("person")).toBe(true);
  });

  it("디자인 레퍼런스는 그 등급이 아니다", () => {
    expect(isIdentityReference("style")).toBe(false);
  });
});

describe("역할 지시문", () => {
  it("첨부가 없으면 아무 말도 하지 않는다", () => {
    expect(buildReferenceRoleDirective([])).toBe("");
  });

  it("첨부 순서대로 번호를 매긴다", () => {
    const directive = buildReferenceRoleDirective([anchor, person, style]);
    expect(directive).toContain("[Image 1 — PRODUCT]");
    expect(directive).toContain("[Image 2 — PERSON]");
    expect(directive).toContain("[Image 3 — DESIGN REFERENCE]");
  });

  it("제품이 빠지면 번호가 당겨진다", () => {
    // 제품 보존을 끄면 앵커를 안 보낸다. 그때 인물이 1번이 되어야 한다.
    const directive = buildReferenceRoleDirective([person, style]);
    expect(directive).toContain("[Image 1 — PERSON]");
    expect(directive).toContain("[Image 2 — DESIGN REFERENCE]");
    expect(directive).not.toContain("PRODUCT");
  });

  it("제품은 정체성을 지키라고 말한다", () => {
    const directive = buildReferenceRoleDirective([anchor]).toLowerCase();
    for (const part of ["silhouette", "colour", "material", "logo", "label"]) {
      expect(directive).toContain(part);
    }
  });

  // 사용자가 규칙을 정할 때 못 박은 것: 세로로 세운 제품 사진을 넣었다고
  // 그 각도가 딱딱하게 그대로 나오면 안 된다.
  it("제품의 각도·구도는 복사하지 말라고 말한다", () => {
    const directive = buildReferenceRoleDirective([anchor]).toLowerCase();
    expect(directive).toContain("do not copy the reference's camera angle");
    expect(directive).toMatch(/crop|distance|background|lighting/);
    expect(directive).toContain("scene description decides");
  });

  it("제품의 실제 비율은 지키라고 말한다", () => {
    // 길쭉한 병이 뚱뚱해지면 안 된다 — 사진 프레임 비율이 아니라 물건의 비율이다.
    const directive = buildReferenceRoleDirective([anchor]);
    expect(directive).toContain("real proportions of the object itself");
    expect(directive.toLowerCase()).toContain("tall slim bottle");
  });

  it("인물은 얼굴을 지키고 표정·자세는 장면에 맡긴다고 말한다", () => {
    const directive = buildReferenceRoleDirective([person]).toLowerCase();
    expect(directive).toContain("same person");
    expect(directive).toMatch(/face|facial geometry/);
    expect(directive).toMatch(/expression|pose/);
  });

  it("레퍼런스는 디자인만 모방하라고 말한다", () => {
    const directive = buildReferenceRoleDirective([style]).toLowerCase();
    expect(directive).toContain("imitate its design language only");
    expect(directive).toMatch(/layout|colour palette|typography/);
    // 그 안의 물건·사람은 가져오지 않는다.
    expect(directive).toContain("not its product");
    expect(directive).toContain("not its people");
  });

  it("정체성과 레퍼런스가 함께 있으면 우선순위를 말한다", () => {
    const directive = buildReferenceRoleDirective([anchor, style]).toLowerCase();
    expect(directive).toContain("win over the design reference");
  });

  it("레퍼런스만 있으면 우선순위 문장은 넣지 않는다", () => {
    expect(buildReferenceRoleDirective([style]).toLowerCase()).not.toContain("win over");
  });
});

// 문장을 만드는 것과 그것이 실제로 모델에 닿는 것은 다르다.
// 결선이 끊기면 정책은 문서에만 남는다 — 실제로 그 일이 있었다.
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

async function generate(options: Record<string, unknown>) {
  const service = new PdpService();
  let prompt = "";
  let kinds: string[] = [];
  await (service as never as {
    generateSectionImageInternal: (request: unknown) => Promise<unknown>;
  }).generateSectionImageInternal({
    originalImageBase64: "iVBORw0KGgo=",
    section: section(),
    aspectRatio: "3:4",
    options: { style: "studio", withModel: false, outputMode: "editable", ...options },
    client: passingClient,
    generateImage: async (
      _model: string,
      input: { prompt: string; references: Array<{ kind: string }> },
    ) => {
      prompt = input.prompt;
      kinds = input.references.map((reference) => reference.kind);
      return { base64: "IMG", mimeType: "image/jpeg" };
    },
  });
  return { prompt, kinds };
}

describe("정책이 실제 생성 호출에 닿는다", () => {
  it("첨부한 이미지와 프롬프트의 번호가 일치한다", async () => {
    const { prompt, kinds } = await generate({
      styleReferenceImages: [{ base64: "AAAA", mimeType: "image/png" }],
      characterReference: { base64: "BBBB", mimeType: "image/png", identityPrompt: "20대 한국 여성" },
    });

    expect(kinds).toEqual(["anchor", "person", "style"]);
    expect(prompt).toContain("[Image 1 — PRODUCT]");
    expect(prompt).toContain("[Image 2 — PERSON]");
    expect(prompt).toContain("[Image 3 — DESIGN REFERENCE]");
  });

  it("캐릭터 생김새 서술도 함께 실린다", async () => {
    const { prompt } = await generate({
      characterReference: { base64: "BBBB", mimeType: "image/png", identityPrompt: "20대 한국 여성" },
    });
    expect(prompt).toContain("20대 한국 여성");
  });

  it("제품 보존을 끄고 레퍼런스가 있으면 앵커가 빠지고 번호도 당겨진다", async () => {
    const { prompt, kinds } = await generate({
      preserveProductImage: false,
      styleReferenceImages: [{ base64: "AAAA", mimeType: "image/png" }],
    });
    expect(kinds).toEqual(["style"]);
    expect(prompt).toContain("[Image 1 — DESIGN REFERENCE]");
    expect(prompt).not.toContain("PRODUCT");
  });

  it("첨부가 제품 하나뿐이면 그것만 설명한다", async () => {
    const { prompt, kinds } = await generate({});
    expect(kinds).toEqual(["anchor"]);
    expect(prompt).toContain("[Image 1 — PRODUCT]");
    expect(prompt).not.toContain("DESIGN REFERENCE");
  });
});

// 인물 참조는 "누가 나오는가"를 정하고, 장면 지시는 "사람이 나오는가"를 정한다.
// 둘이 어긋나면 얼굴을 지키라는 사진을 붙여 놓고 사람이 안 나오거나,
// 제품 클로즈업에 사람이 끼어든다.
describe("인물 참조와 장면 지시가 어긋나지 않는다", () => {
  const peopleRule = (prompt: string) => /"people": "([^"]*)/.exec(prompt)?.[1] ?? "";

  it("캐릭터를 쓰고 인물컷을 켜면 사람이 필수라고 말한다", async () => {
    const { prompt, kinds } = await generate({
      withModel: true,
      characterReference: { base64: "BBBB", mimeType: "image/png", identityPrompt: "20대 한국 여성" },
    });
    expect(kinds).toContain("person");
    expect(peopleRule(prompt)).toContain("required");
  });

  it("인물컷을 끄면 캐릭터를 붙여도 사람은 선택이다", async () => {
    // 배치 경로는 withModel 을 켜지 않고 캐릭터를 보낸다. 장면이 부르지 않는
    // 섹션(제품 클로즈업)에 사람을 밀어 넣지 않아야 한다.
    const { prompt, kinds } = await generate({
      withModel: false,
      characterReference: { base64: "BBBB", mimeType: "image/png", identityPrompt: "20대 한국 여성" },
    });
    expect(kinds).toContain("person");
    expect(peopleRule(prompt)).toContain("optional");
  });

  it("업로드 사진이 우선하면 캐릭터 생김새 서술은 싣지 않는다", async () => {
    // 얼굴은 사진 것인데 서술이 캐릭터를 묘사하면 다른 사람을 그리게 된다.
    const { prompt, kinds } = await generate({
      withModel: true,
      referenceModelImageBase64: "UUUU",
      referenceModelImageMimeType: "image/png",
      referenceModelProfile: { hairstyle: "단발", keepTraits: [], distinctiveFeatures: [] },
      characterReference: { base64: "BBBB", mimeType: "image/png", identityPrompt: "40대 남성" },
    });
    expect(kinds.filter((kind) => kind === "person")).toHaveLength(1);
    expect(prompt).not.toContain("40대 남성");
  });

  it("사람이 나온다고 단정하지 않는다", async () => {
    const { prompt } = await generate({
      withModel: false,
      characterReference: { base64: "BBBB", mimeType: "image/png", identityPrompt: "20대 한국 여성" },
    });
    expect(prompt).toContain("Whenever a person appears");
  });
});

/**
 * 실측으로 정한 것(2026-07-30, gpt-image-2, 조건당 2장).
 *
 * 레퍼런스가 짙은 올리브를 **면**으로 쓰는 디자인일 때:
 *   역할 지시문만 → 0/2 면으로 씀 (글자색으로만)
 *   분석 서술만   → 2/2
 *   둘 다        → 2/2
 *
 * 제품·인물 정체성은 세 조건 모두 6/6 유지. 제품 보존 지시가 없는 조건에서도 유지됐다.
 * 그래서 서술은 **디자인 레퍼런스에만** 곁들인다.
 */
describe("디자인 레퍼런스의 색 쓰임새", () => {
  it("색을 어떻게 쓰는지까지 따라오라고 말한다", () => {
    const directive = buildReferenceRoleDirective([style]).toLowerCase();
    expect(directive).toContain("how each colour is used");
    expect(directive).toMatch(/fill surfaces|bands/);
    expect(directive).toContain("not just the colours themselves");
  });

  it("서술이 있으면 레퍼런스 설명 뒤에 싣는다", () => {
    const directive = buildReferenceRoleDirective([
      { ...style, description: "팔레트: 짙은 올리브를 배경색으로" },
    ]);
    expect(directive).toContain("How this reference uses its design language:");
    expect(directive).toContain("짙은 올리브를 배경색으로");
    // 설명은 해당 이미지 블록 안에 있어야 한다. 다른 참조 뒤로 밀리면 무엇에 대한
    // 말인지 흐려진다.
    expect(directive.indexOf("DESIGN REFERENCE")).toBeLessThan(
      directive.indexOf("짙은 올리브를 배경색으로"),
    );
  });

  it("서술이 없으면 그 줄을 넣지 않는다", () => {
    expect(buildReferenceRoleDirective([style])).not.toContain("How this reference uses");
  });

  it("빈 서술도 넣지 않는다", () => {
    // 분석이 실패하면 빈 문자열이 온다. 제목만 남으면 모델이 헤맨다.
    const directive = buildReferenceRoleDirective([{ ...style, description: "   " }]);
    expect(directive).not.toContain("How this reference uses");
  });

  it("제품·인물에는 서술을 싣지 않는다", () => {
    // 정체성은 이미지가 지킨다. 문장을 더하면 첨부된 얼굴·물건과 어긋날 위험만 생긴다.
    const directive = buildReferenceRoleDirective([
      { ...anchor, description: "제품 서술" },
      { ...person, description: "인물 서술" },
    ]);
    expect(directive).not.toContain("제품 서술");
    expect(directive).not.toContain("인물 서술");
  });
});

describe("서술이 실제 생성 호출까지 닿는다", () => {
  it("스타일 레퍼런스의 서술이 프롬프트에 실린다", async () => {
    const { prompt } = await generate({
      styleReferenceImages: [
        { base64: "AAAA", mimeType: "image/png", description: "팔레트: 짙은 올리브를 배경색으로" },
      ],
    });
    expect(prompt).toContain("How this reference uses its design language:");
    expect(prompt).toContain("짙은 올리브를 배경색으로");
  });

  it("서술이 없으면 그 줄 없이 이미지만 간다", async () => {
    const { prompt, kinds } = await generate({
      styleReferenceImages: [{ base64: "AAAA", mimeType: "image/png" }],
    });
    expect(kinds).toContain("style");
    expect(prompt).not.toContain("How this reference uses");
  });
});


/**
 * 첨부를 실제로 보라는 한 줄과, 무엇이 무엇을 이기는지.
 *
 * 모델은 첨부가 있어도 「이런 종류의 그림」을 기억에서 꺼내 그리는 쪽으로 쏠린다.
 * 그러면 라벨 글자가 비슷한 다른 글자가 되고 색도 근처 색이 된다.
 */
describe("첨부 선언과 우선순위", () => {
  it("첨부가 있으면 실제로 보라고 먼저 말한다", () => {
    const directive = buildReferenceRoleDirective([anchor]);
    expect(directive.startsWith("Study every attached image closely")).toBe(true);
    expect(directive).toContain("never substitute a generic stand-in");
  });

  it("첨부가 없으면 그 줄도 없다", () => {
    expect(buildReferenceRoleDirective([], { hasUserInstruction: true })).toBe("");
  });

  it("사용자 지시가 있으면 그것이 맨 위라고 적는다", () => {
    const directive = buildReferenceRoleDirective([anchor, style], { hasUserInstruction: true });
    expect(directive).toContain("Priority when instructions conflict: the USER INSTRUCTION");
    expect(directive).toContain("the PRESERVED SUBJECT");
  });

  it("제품·인물이 디자인 레퍼런스를 이기는 규칙은 그대로 남는다", () => {
    const directive = buildReferenceRoleDirective([anchor, style], { hasUserInstruction: true });
    expect(directive.toLowerCase()).toContain("win over");
  });

  // 상세페이지에서 장면을 정하는 것은 섹션 블루프린트다. 사용자 지시가 없는데
  // 「레퍼런스 > 장면 지시」라고 적으면 style 역할 규칙과 부딪힌다.
  it("사용자 지시가 없으면 서열 줄을 넣지 않는다", () => {
    expect(buildReferenceRoleDirective([anchor, style])).not.toContain("Priority when instructions conflict");
  });
});
