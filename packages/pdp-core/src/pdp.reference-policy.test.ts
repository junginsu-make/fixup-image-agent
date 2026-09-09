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

/**
 * 설계 §4-1 A안 — **자리별로** 적용한다.
 *
 * 포스터는 첨부 지시가 하나뿐이라 지시를 적으면 모든 역할 문구가 함께 빠진다.
 * 설계 문서가 걱정한 것이 바로 그것이다 — 「왼쪽에 놓아 줘」만 써도 얼굴
 * 지키기가 풀린다.
 *
 * 상세페이지는 자리마다 따로 받으므로 그 걱정이 없다. 레퍼런스에 적은 말이
 * 제품 지키기를 풀지 않는다.
 *
 * 그리고 **적은 말이 실제로 프롬프트에 실려야 한다.** 카드뉴스에서 스위치만
 * 옮기고 원문을 안 옮겨, 보호 문구만 사라지고 대신 들어오는 말이 없었다.
 */
describe("자리별 지시 (설계 4-1 A안)", () => {
  it("적은 말이 프롬프트에 그대로 실린다", () => {
    const directive = buildReferenceRoleDirective([
      { ...style, intent: "색만 가져오고 배치는 무시해 주세요" },
    ]);
    expect(directive).toContain("색만 가져오고 배치는 무시해 주세요");
  });

  it("지시를 적은 자리의 고정 문구는 빠진다", () => {
    const withRules = buildReferenceRoleDirective([style]);
    const withIntent = buildReferenceRoleDirective([{ ...style, intent: "색만 가져와" }]);

    expect(withRules).toContain("Imitate its design language only:");
    expect(withIntent).not.toContain("Imitate its design language only:");
  });

  it("번호와 역할 이름은 남는다 — 빼면 무엇에 대한 말인지 사라진다", () => {
    const directive = buildReferenceRoleDirective([
      anchor,
      { ...style, intent: "색만 가져와" },
    ]);
    expect(directive).toContain("[Image 1 — PRODUCT]");
    expect(directive).toContain("[Image 2 — DESIGN REFERENCE]");
  });

  it("**다른 자리의 고정 문구는 그대로 남는다** — 이것이 자리별로 두는 이유다", () => {
    const directive = buildReferenceRoleDirective([
      anchor,
      { ...style, intent: "색만 가져와" },
    ]);
    // 제품 지키기는 살아 있어야 한다
    expect(directive).toContain("Never redesign, restyle or substitute the product");
    // 레퍼런스 규칙만 빠졌다
    expect(directive).not.toContain("Imitate its design language only:");
  });

  it("사람에게 적어도 제품은 안 풀린다", () => {
    const directive = buildReferenceRoleDirective([
      anchor,
      { ...person, intent: "안경을 꼭 씌워 주세요" },
    ]);
    expect(directive).toContain("Never redesign, restyle or substitute the product");
    expect(directive).not.toContain("Do not beautify, slim, age, de-age or restyle them");
    expect(directive).toContain("안경을 꼭 씌워 주세요");
  });

  it("빈 문자열이나 공백만 적은 것은 안 적은 것이다", () => {
    const blank = buildReferenceRoleDirective([{ ...style, intent: "   " }]);
    expect(blank).toContain("Imitate its design language only:");
  });

  it("지시가 있으면 그 말이 규칙을 대신한다고 밝힌다", () => {
    const directive = buildReferenceRoleDirective([{ ...style, intent: "색만 가져와" }]);
    expect(directive).toMatch(/replace the usual rules/i);
  });

  it("지시가 없으면 그 안내도 없다 — 뺀 것이 없는데 뺐다고 말하지 않는다", () => {
    const directive = buildReferenceRoleDirective([anchor, style]);
    expect(directive).not.toMatch(/replace the usual rules/i);
  });

  it("레퍼런스 서술은 지시가 있어도 남는다 — 서술은 사용자 말과 부딪히지 않는다", () => {
    const directive = buildReferenceRoleDirective([
      { ...style, description: "주조색을 면으로 쓴다", intent: "색만 가져와" },
    ]);
    expect(directive).toContain("주조색을 면으로 쓴다");
  });

  it("자리마다 다른 말을 적으면 각자 실린다", () => {
    const directive = buildReferenceRoleDirective([
      { ...anchor, intent: "라벨 글씨는 그대로" },
      { ...person, intent: "안경을 씌워 주세요" },
      { ...style, intent: "색만 가져와" },
    ]);
    expect(directive).toContain("라벨 글씨는 그대로");
    expect(directive).toContain("안경을 씌워 주세요");
    expect(directive).toContain("색만 가져와");
    expect(directive).not.toContain("Never redesign, restyle or substitute the product");
  });

  it("자리 지시만 있어도 우선순위 줄이 나온다", () => {
    const directive = buildReferenceRoleDirective([anchor, { ...style, intent: "색만 가져와" }]);
    expect(directive).toMatch(/Priority when instructions conflict/i);
  });
});

/**
 * 독립 리뷰가 잡은 것들.
 *
 * 프롬프트가 스스로 모순되면 모델이 어느 쪽을 따를지 알 수 없다. 「규칙을 뺐다」고
 * 써 놓고 규칙이 남아 있거나, 없는 블록을 1등으로 올려 두면 그렇게 된다.
 */
describe("프롬프트가 스스로 모순되지 않는다", () => {
  it("우선순위 줄이 가리키는 블록이 실제로 있다", () => {
    const directive = buildReferenceRoleDirective([{ ...style, intent: "색만 가져와" }]);
    // 「USER INSTRUCTION 이 1등」이라고 써 두려면 그 이름의 블록이 있어야 한다.
    expect(directive).toMatch(/Priority when instructions conflict/i);
    expect(directive).toContain("USER INSTRUCTION");
  });

  it("서술이 지시를 덮지 않는다 — 서열을 밝힌다", () => {
    const directive = buildReferenceRoleDirective([
      { ...style, description: "가운데 정렬에 위 여백이 넓다", intent: "배치는 무시해 주세요" },
    ]);
    const 지시자리 = directive.indexOf("배치는 무시해 주세요");
    const 서술자리 = directive.indexOf("가운데 정렬에 위 여백이 넓다");
    expect(지시자리).toBeGreaterThan(-1);
    expect(서술자리).toBeGreaterThan(지시자리);
    // 서술이 뒤에 오므로 어느 쪽이 센지 못 박아야 한다.
    expect(directive).toMatch(/instruction above wins/i);
  });

  it("지시가 없으면 서술에 그런 단서를 안 붙인다", () => {
    const directive = buildReferenceRoleDirective([
      { ...style, description: "가운데 정렬에 위 여백이 넓다" },
    ]);
    expect(directive).toContain("가운데 정렬에 위 여백이 넓다");
    expect(directive).not.toMatch(/instruction above wins/i);
  });

  it("보호를 푼 그림을 계속 「지킨 대상」이라 부르지 않는다", () => {
    const 안풂 = buildReferenceRoleDirective([anchor]);
    const 품 = buildReferenceRoleDirective([{ ...anchor, intent: "만화풍으로 다시 그려 주세요" }]);
    expect(안풂).toMatch(/preserved subject/i);
    expect(품).not.toMatch(/preserved subject/i);
  });

  it("하나만 풀면 나머지는 여전히 지킨 대상이다", () => {
    const directive = buildReferenceRoleDirective([
      { ...anchor, intent: "만화풍으로" },
      person,
    ]);
    expect(directive).toMatch(/preserved subject/i);
  });

  it("보호를 푼 자리는 레퍼런스를 이긴다고 말하지 않는다", () => {
    const 안풂 = buildReferenceRoleDirective([anchor, style]);
    const 품 = buildReferenceRoleDirective([{ ...anchor, intent: "만화풍으로" }, style]);
    expect(안풂).toContain("the product and the person win over the design reference");
    expect(품).not.toContain("the product and the person win over the design reference");
  });
});

/**
 * 긴 상세페이지 레퍼런스는 **조각으로 나눠서** 온다.
 *
 * 조각을 그냥 여러 장으로 던지면 모델이 서로 다른 레퍼런스 넷으로 읽고 절충한다.
 * 「한 페이지를 위에서 아래로 나눈 것」이라고 말해야 이어 읽는다.
 *
 * 사용자 지적: 긴 상세페이지는 중간에 다른 느낌·다른 디자인이 들어간다.
 * 맨 위 한 장만 보내면 그 페이지를 「어두운 히어로 하나」로 읽는다.
 */
describe("레퍼런스 조각", () => {
  const slice = (n: string) => ({ ...style, base64: n });

  it("조각이 여럿이면 한 페이지를 나눈 것이라고 말한다", () => {
    const directive = buildReferenceRoleDirective([slice("A"), slice("B"), slice("C")]);
    expect(directive).toMatch(/slices of ONE long detail page/i);
    expect(directive).toMatch(/top to bottom/i);
  });

  it("조각마다 몇 번째인지 알려준다 — 섹션에 맞는 조각을 고르게", () => {
    const directive = buildReferenceRoleDirective([slice("A"), slice("B"), slice("C")]);
    expect(directive).toMatch(/part 1 of 3/i);
    expect(directive).toMatch(/part 3 of 3/i);
  });

  it("한 장이면 조각 이야기를 안 한다", () => {
    const directive = buildReferenceRoleDirective([style]);
    expect(directive).not.toMatch(/slices of ONE/i);
    expect(directive).not.toMatch(/part 1 of/i);
  });

  it("역할 규칙은 한 번만 말한다 — 조각마다 되풀이하면 프롬프트가 규칙으로 찬다", () => {
    const directive = buildReferenceRoleDirective([slice("A"), slice("B"), slice("C")]);
    const 횟수 = directive.split("Imitate its design language only:").length - 1;
    expect(횟수).toBe(1);
  });

  it("제품·인물과 섞여도 조각만 묶어서 센다", () => {
    const directive = buildReferenceRoleDirective([anchor, person, slice("A"), slice("B")]);
    expect(directive).toContain("[Image 1 — PRODUCT]");
    expect(directive).toContain("[Image 2 — PERSON]");
    expect(directive).toMatch(/part 1 of 2/i);
    expect(directive).toMatch(/part 2 of 2/i);
  });
});
