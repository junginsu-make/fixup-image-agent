import { describe, expect, it } from "vitest";
import { buildPosterPrompt } from "../prompt";
import { EMPTY_SLOTS } from "../schemas";

const slots = {
  ...EMPTY_SLOTS,
  kind: "전시 홍보",
  headline: "가을, 셔터를 누르다",
  subline: "필름으로 담은 도시의 온도",
  sideTexts: ["28MM F2.0", "ISO 400"],
  scene: "해질녘 골목",
  subject: "필름 카메라를 든 20대 여성",
  action: "셔터를 누르는 순간",
  typeInteraction: "통과" as const,
  dominantColor: "따뜻한 세피아",
  accentColor: "선명한 주황",
  forbidden: "로고, 워터마크",
};

const images = [
  { kind: "style_reference" as const, title: "SNAP" },
  { kind: "preserved" as const, title: "제품 사진" },
];

const size = { width: 1024, height: 1536 };

describe("레퍼런스는 꼴만 가져온다", () => {
  const only = buildPosterPrompt({ slots, images: [{ kind: "style_reference" }], size });

  it("레퍼런스 안의 것은 가져오지 말라고 못 박는다", () => {
    // 안 적으면 모델이 레퍼런스의 아이콘·제품·글자를 통째로 베낀다.
    expect(only).toMatch(/Do NOT copy/i);
    expect(only).toMatch(/icons|illustrations/i);
  });

  it("아이콘은 같은 양식으로 새로 그리라고 한다", () => {
    expect(only).toMatch(/Draw new|same style/i);
  });

  it("색을 어디에 쓰는지까지 말한다", () => {
    expect(only).toMatch(/how each colour is used|fill surfaces/i);
  });
});

describe("지키는 대상이 사람인지 물건인지 가른다", () => {
  // 실측 정책(pdp.reference-policy.ts): 얼굴이 둘이면 모델이 절충해 제3의
  // 인물을 만든다. 물건과 사람을 같은 문장으로 지키라고 하면 그 경고를 할
  // 자리가 없다.
  const person = buildPosterPrompt({
    slots,
    images: [{ kind: "preserved", subject: "person", title: "모델" }],
    size,
  });
  const product = buildPosterPrompt({
    slots,
    images: [{ kind: "preserved", subject: "object", title: "제품" }],
    size,
  });

  it("사람에게는 얼굴과 체형을 지키라고 한다", () => {
    expect(person).toMatch(/facial features|face/i);
  });

  it("물건에게는 라벨과 재질을 지키라고 한다", () => {
    expect(product).toMatch(/labels/i);
    expect(product).not.toMatch(/facial features/i);
  });

  it("얼굴이 둘이면 하나만 쓰라고 못 박는다", () => {
    const twoFaces = buildPosterPrompt({
      slots,
      images: [
        { kind: "preserved", subject: "person", title: "모델 A" },
        { kind: "preserved", subject: "person", title: "모델 B" },
      ],
      size,
    });
    expect(twoFaces).toMatch(/only one person|single person/i);
  });

  it("대상을 안 적으면 물건으로 다룬다", () => {
    // 옛 자료에는 대상이 없다. 사람으로 보면 없는 얼굴을 지키려 든다.
    const legacy = buildPosterPrompt({ slots, images: [{ kind: "preserved", title: "무엇" }], size });
    expect(legacy).not.toMatch(/facial features/i);
  });
});

describe("사용자가 직접 친 말이 가장 세다", () => {
  const prompt = buildPosterPrompt({
    slots, images, size, userInstruction: "배경은 밤, 창밖에 네온",
  });

  it("맨 앞과 맨 뒤 두 곳에 넣는다", () => {
    // 2026-09-04 실측: 프롬프트 뒤에 긴 문단을 붙였더니 앞쪽 구도 지시가 밀려
    // 무시됐다. 긴 프롬프트에서 중간 문장은 힘을 잃으므로 양끝에 둔다.
    const first = prompt.indexOf("배경은 밤, 창밖에 네온");
    const last = prompt.lastIndexOf("배경은 밤, 창밖에 네온");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(last).toBeGreaterThan(first);
    // 앞의 것이 정말 맨 앞이다. 첨부 설명보다 먼저 읽힌다.
    expect(first).toBeLessThan(prompt.indexOf("Image 1 is"));
    // 뒤의 것이 정말 맨 뒤다. 출력 크기 줄 바로 앞이다.
    expect(last).toBeGreaterThan(prompt.indexOf("Do not include"));
  });

  it("우선순위 줄에서 사용자 지시가 맨 앞이다", () => {
    const priority = prompt.slice(prompt.indexOf("Priority when instructions conflict"));
    expect(priority).toMatch(/USER INSTRUCTION/);
    expect(priority.indexOf("USER INSTRUCTION")).toBeLessThan(priority.indexOf("PRESERVED"));
    expect(priority.indexOf("PRESERVED")).toBeLessThan(priority.indexOf("REFERENCE"));
  });

  it("비어 있으면 그 줄 자체를 넣지 않는다", () => {
    const bare = buildPosterPrompt({ slots, images, size });
    expect(bare).not.toMatch(/USER INSTRUCTION/);
    expect(bare).not.toMatch(/re-read the USER INSTRUCTION/);
  });

  it("공백만 적은 것은 안 적은 것으로 본다", () => {
    const blank = buildPosterPrompt({ slots, images, size, userInstruction: "   \n  " });
    expect(blank).not.toMatch(/USER INSTRUCTION/);
  });
});

describe("결을 고르면 그 결로 그린다", () => {
  it("auto 면 결 지시를 넣지 않는다", () => {
    // 기본이 auto 여야 지금까지 쓰던 사람이 안 깨진다 — 첨부한 그림의 결을
    // 따라가는 지금 동작이 그대로 유지된다.
    const auto = buildPosterPrompt({ slots, images, size, look: "auto" });
    const omitted = buildPosterPrompt({ slots, images, size });
    expect(auto).toBe(omitted);
    expect(auto).not.toMatch(/cel-shaded|photographic realism|hand-drawn illustration/i);
  });

  it("애니를 고르면 셀 셰이딩을 말한다", () => {
    const anime = buildPosterPrompt({ slots, images, size, look: "anime" });
    expect(anime).toMatch(/cel-shaded/i);
  });

  it("실사를 고르면 사진처럼 그리라고 한다", () => {
    const photoreal = buildPosterPrompt({ slots, images, size, look: "photoreal" });
    expect(photoreal).toMatch(/real photograph/i);
  });
});

describe("첨부한 그림을 기억으로 대충 그리지 말라고 한다", () => {
  it("첨부가 있으면 먼저 자세히 보라고 못 박는다", () => {
    const prompt = buildPosterPrompt({ slots, images, size });
    expect(prompt).toMatch(/Study every attached image closely/);
    expect(prompt).toMatch(/never substitute a generic stand-in/);
  });

  it("첨부가 없으면 그 줄을 넣지 않는다", () => {
    const none = buildPosterPrompt({ slots, images: [], size });
    expect(none).not.toMatch(/Study every attached image/);
    // 가리킬 그림이 없으면 우선순위를 말할 상대도 없다.
    expect(none).not.toMatch(/Priority when instructions conflict/);
  });
});

describe("포스터 프롬프트", () => {
  const prompt = buildPosterPrompt({ slots, images, size });

  it("첨부마다 역할을 번호로 알려준다", () => {
    expect(prompt).toMatch(/Image 1 is[\s\S]*REFERENCE/);
    expect(prompt).toMatch(/Image 2 is[\s\S]*PRESERVED/);
  });

  it("보존 대상이 스타일보다 우선한다", () => {
    const priority = prompt.slice(prompt.indexOf("Priority"));
    expect(priority.indexOf("PRESERVED")).toBeLessThan(priority.indexOf("REFERENCE"));
  });

  it("이전 결과를 붙이지 않는다 — 앵커가 없다", () => {
    expect(prompt).not.toMatch(/same series/i);
    expect(prompt).not.toMatch(/Only the content differs/i);
    expect(prompt).not.toMatch(/previous/i);
  });

  it("비어 있지 않은 글자 칸마다 자리를 준다", () => {
    for (const value of ["가을, 셔터를 누르다", "필름으로 담은 도시의 온도", "28MM F2.0", "ISO 400"]) {
      expect(prompt).toContain(value);
    }
  });

  it("길면 줄이지 말고 작게 넣으라고 한다", () => {
    expect(prompt).toMatch(/smaller font|more lines/i);
    expect(prompt).toMatch(/Do not omit|do not shorten/i);
  });

  it("원고에 없는 것을 지어내지 말라고 한다", () => {
    expect(prompt).toMatch(/copyright/i);
    expect(prompt).toMatch(/Do not invent/i);
  });

  it("배경 글자는 금지가 아니라 자제다", () => {
    // 간판·표지판까지 막으면 그림이 어색해진다. 2026-08-20 결정.
    expect(prompt).toMatch(/sparse|subordinate/i);
    expect(prompt).not.toMatch(/not listed above/i);
  });

  it("타이포 관계를 따로 말한다", () => {
    expect(prompt).toMatch(/통과|through/i);
  });

  it("금지 항목을 전한다", () => {
    expect(prompt).toContain("로고, 워터마크");
  });

  it("출력 크기를 명시한다", () => {
    expect(prompt).toContain("1024x1536");
  });

  it("글자수를 숫자로 못 박지 않는다", () => {
    expect(prompt).not.toMatch(/\d+\s*characters/i);
  });

  it("빈 슬롯만 있어도 프롬프트가 깨지지 않는다", () => {
    const bare = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [], size });
    expect(bare.length).toBeGreaterThan(0);
    expect(bare).toContain("1024x1536");
  });

  it("글자 칸이 하나도 없으면 렌더 지시를 넣지 않는다", () => {
    const bare = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [], size });
    expect(bare).not.toMatch(/Render this/i);
  });

  it("픽셀을 모르는 모델에는 크기를 적지 않는다", () => {
    // 비율을 열거형으로 받는 모델은 픽셀이 없다. 그때 크기 자리에 0 이
    // 들어가 "Output size 0x0" 이 그대로 모델에게 갔다.
    const enumMode = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [] });
    expect(enumMode).not.toContain("0x0");
    expect(enumMode).not.toMatch(/Output size/i);
    // 크기와 함께 있던 지시는 남아야 한다.
    expect(enumMode).toContain("No outer border");
  });
});

/**
 * 글자를 안 적었으면 「넣지 마라」고 말해야 한다.
 *
 * 전에는 글자 칸이 전부 비면 프롬프트에서 **글자 이야기가 통째로 사라졌다** —
 * 「넣지 마라」도 함께. 그런데 맨 앞 `designerPersona()` 는 「confident
 * typography」를 요구하고 첨부는 `POSTER REFERENCE` 라고 부른다. 막는 말이
 * 없으니 모델이 글자를 만든다.
 *
 * 실제로 첨부 두 장에 글자가 없고 사용자도 요구하지 않았는데 「BEST DAY
 * EVER!」가 크게 박혀 나왔다(2026-09-08 사용자 실측).
 */
describe("글자를 안 적었을 때", () => {
  const noCopy = {
    slots: { ...EMPTY_SLOTS, scene: "강가 바위", subject: "청년 다섯" },
    images: [{ kind: "style_reference" as const }],
  };

  it("글자를 넣지 말라고 말한다", () => {
    const prompt = buildPosterPrompt(noCopy);
    expect(prompt).toContain("Render it with NO text");
  });

  it("무엇이 글자인지 낱낱이 적는다 — 「제목만 아니면 된다」로 새지 않게", () => {
    const prompt = buildPosterPrompt(noCopy);
    for (const word of ["headline", "tagline", "slogan", "caption", "watermark", "logo"]) {
      expect(prompt, `${word} 를 막아야 한다`).toContain(word);
    }
  });

  it("글자가 없는 것이 완성이라고 말한다", () => {
    // 「균형을 위해 글자를 넣자」는 판단을 미리 막는다.
    expect(buildPosterPrompt(noCopy)).toContain("not an unfinished one");
  });

  it("첨부에 원래 있던 글자는 남겨도 된다", () => {
    // 사진 속 티셔츠 문구까지 지우면 첨부를 안 따라간 것이 된다.
    expect(buildPosterPrompt(noCopy)).toContain("do not invent any that was not already there");
  });

  it("한 칸이라도 적었으면 그 칸을 그리라고 말한다 — 지금까지의 동작", () => {
    const prompt = buildPosterPrompt({
      ...noCopy,
      slots: { ...noCopy.slots, headline: "가을, 셔터를 누르다" },
    });
    expect(prompt).toContain("Render this text exactly as written");
    expect(prompt).toContain("가을, 셔터를 누르다");
    expect(prompt).not.toContain("Render it with NO text");
  });

  it("곁텍스트 하나만 있어도 「글자 없음」이 아니다", () => {
    const prompt = buildPosterPrompt({
      ...noCopy,
      slots: { ...noCopy.slots, sideTexts: ["28MM F2.0"] },
    });
    expect(prompt).not.toContain("Render it with NO text");
  });
});

/**
 * **첨부 지시는 역할 규칙을 이긴다 — 지우지는 않는다.**
 *
 * 2026-09-08 에는 지시를 적으면 역할 문구를 **통째로 뺐다**(설계 §4-1 A안).
 * 까닭이 있었다 — 「1번 사진의 사람들을 2번 느낌으로」라고 적었는데 프롬프트가
 * 두 장 모두에 `not its people` 을 보내 사람이 새로 만들어졌다. 우선순위 한
 * 줄로는 못 이겼다. 반대편이 여섯 문장이고 전부 구체적이기 때문이다.
 *
 * **그런데 지우는 것이 과했다.** 2026-09-17 에 실물로 드러났다 — 첨부 셋
 * (포스터·인물·모자)에 「카메라의 주목을 받는 힙하고 자유로운 느낌」이라고
 * 적었더니, 부딪히지도 않는 **905자**가 함께 사라졌다.
 *
 *   · 모자 → 「이 물건을 그대로. 실루엣·색·재질·라벨까지」 사라짐
 *   · 포스터 → 「배치·타이포·색 쓰임새를 따라가라」 사라짐
 *
 * 결과에 모자도 포스터 느낌도 안 나왔다. 적은 말은 역할과 **부딪히지도 않는
 * 말**이었는데, 부딪힐 것까지 통째로 지워진 것이다.
 *
 * **고친 방향:** 역할 규칙은 늘 보낸다. 대신 사용자 말이 **이긴다**고 못 박고
 * 그것을 역할 규칙 **뒤에** 둔다 — 뒤에 온 말이 앞말을 덮는 것이 이 저장소가
 * 여러 번 확인한 순서다(2026-09-04 실측, 2026-09-17 카드뉴스).
 */
describe("첨부 지시를 적었을 때", () => {
  const intent = "1번 사진의 사람들을 2번 그림 느낌(만화)으로";
  const base = {
    slots: { ...EMPTY_SLOTS, scene: "강가 바위", subject: "청년 다섯" },
    images: [
      { kind: "preserved" as const, subject: "person" as const },
      { kind: "style_reference" as const },
    ],
  };

  /** 지우면 모자가 안 나온다. 2026-09-17 에 실제로 그랬다. */
  it("역할 규칙이 남는다", () => {
    const prompt = buildPosterPrompt({ ...base, attachmentIntent: intent });

    expect(prompt).toContain("Reproduce this exact person");
    expect(prompt).toContain("Imitate its design language only");
  });

  it("지킬 물건의 규칙도 남는다", () => {
    const prompt = buildPosterPrompt({
      slots: base.slots,
      images: [{ kind: "preserved" as const, subject: "object" as const }],
      attachmentIntent: "힙하고 자유로운 느낌",
    });

    expect(prompt).toContain("Reproduce this exact object");
    expect(prompt).toContain("it is not a similar product, it is this product");
  });

  /**
   * **이긴다고 말해 줘야 이긴다.** 규칙을 남기기만 하면 2026-09-08 의 사고가
   * 되돌아온다 — 여섯 문장짜리 구체적인 규칙이 한 줄을 이긴다.
   */
  it("사용자 말이 이긴다고 못 박는다", () => {
    const prompt = buildPosterPrompt({ ...base, attachmentIntent: intent });

    expect(prompt).toContain("Their words OVERRIDE any rule above");
  });

  /**
   * **뒤에 둔다.** 앞에 두면 규칙이 그것을 덮는다. 이 저장소가 여러 번 확인한
   * 순서다 — 2026-09-04 실측, 2026-09-17 카드뉴스 모델 문구.
   */
  it("역할 규칙 뒤에 온다", () => {
    const prompt = buildPosterPrompt({ ...base, attachmentIntent: intent });
    const 규칙 = prompt.indexOf("Reproduce this exact person");
    const 이긴다 = prompt.indexOf("Their words OVERRIDE any rule above");

    expect(규칙).toBeGreaterThan(-1);
    expect(이긴다).toBeGreaterThan(규칙);
  });

  it("**번호와 역할 이름도 남는다** — 빼면 「1번」이 가리킬 것이 없다", () => {
    const prompt = buildPosterPrompt({ ...base, attachmentIntent: intent });

    expect(prompt).toContain("Image 1 is a PRESERVED PERSON");
    expect(prompt).toContain("Image 2 is a POSTER REFERENCE");
  });

  /** 적은 말은 그대로 실린다. 요약하면 그 말이 시킨 것이 사라진다. */
  it("적은 말이 그대로 실린다", () => {
    expect(buildPosterPrompt({ ...base, attachmentIntent: intent })).toContain(intent);
  });

  it("지시를 안 적었으면 지금까지 그대로다", () => {
    const prompt = buildPosterPrompt(base);

    expect(prompt).toContain("Reproduce this exact person");
    expect(prompt).toContain("not its people");
    expect(prompt).not.toContain("Their words OVERRIDE any rule above");
  });
});

/**
 * 「사람은 그대로, 그림 느낌만」 — 설계 §4-3 (2026-09-08 사용자 결정).
 *
 * **실측이 이 옵션을 불렀다.** 사진 다섯 명을 만화로 바꿨더니 사람은 나왔는데
 * 세 번째 사람의 안경이 몇 번을 돌려도 안 나왔다. 프롬프트 어디에도 「하나하나
 * 그대로 옮겨라」가 없었고, 인물 묘사는 기획이 쓴 한 줄 요약뿐이었다.
 */
describe("사람은 그대로 두고 그림 느낌만 바꿀 때", () => {
  const base = { slots: { ...EMPTY_SLOTS, scene: "강가 바위" } };
  const restyled = {
    ...base,
    images: [{ kind: "preserved" as const, subject: "person" as const, restyle: true }],
  };

  it("그림 느낌을 바꾸라고 말한다", () => {
    const prompt = buildPosterPrompt(restyled);
    expect(prompt).toContain("PRESERVED PERSON, REDRAWN");
    expect(prompt).toContain("redrawn in the rendering style");
  });

  it("**restyle 을 금지하지 않는다** — 바로 그것을 시킨 것이다", () => {
    // `preserveDirective("preserve-person")` 은 restyle 을 금지한다. 그 말이
    // 그대로 가면 「이 사람들을 만화로」가 처음부터 막힌다.
    expect(buildPosterPrompt(restyled)).not.toContain("Do not beautify, slim, age, de-age, restyle");
  });

  it("작은 것을 이름으로 부른다 — 안경이 사라진 이유가 그것이다", () => {
    const prompt = buildPosterPrompt(restyled);
    for (const item of ["glasses", "sunglasses", "hats and caps", "watches", "shoes"]) {
      expect(prompt, `${item} 를 이름으로 불러야 한다`).toContain(item);
    }
  });

  it("한 명씩 확인하라고 못 박는다", () => {
    // 여럿이면 전체 인상만 맞추고 개인을 뭉갠다.
    expect(buildPosterPrompt(restyled)).toContain("Go through the people one at a time");
  });

  it("얼굴은 여전히 지킨다 — 그림 느낌만 바뀌는 것이다", () => {
    const prompt = buildPosterPrompt(restyled);
    expect(prompt).toContain("face shape, eye shape, nose, mouth, jawline");
    expect(prompt).toContain("recognisably theirs in the new style");
  });

  it("표시가 없으면 지금까지 그대로다 — 옛 작업", () => {
    const prompt = buildPosterPrompt({
      ...base,
      images: [{ kind: "preserved", subject: "person" }],
    });
    expect(prompt).toContain("Do not beautify, slim, age, de-age, restyle");
    expect(prompt).not.toContain("REDRAWN");
  });

  it("물건에는 안 붙는다", () => {
    const prompt = buildPosterPrompt({
      ...base,
      images: [{ kind: "preserved", subject: "object", restyle: true }],
    });
    expect(prompt).not.toContain("REDRAWN");
  });

  /**
   * **첨부 지시를 적어도 역할 규칙은 남는다.**
   *
   * 전에는 지시를 적으면 다른 역할의 문구가 사라졌고(§4-1 A안), 이 역할만
   * 예외로 남겼다. 2026-09-17 에 그 「사라짐」이 과하다는 것이 실물로 드러나
   * 전부 남기는 쪽으로 바꿨다 — 사용자 말은 지우는 대신 **이긴다**.
   *
   * 이 역할(사람은 그대로, 그림 느낌만)의 말은 여전히 남아야 한다. 지우면
   * 4-3 을 만든 이유가 사라지고 안경이 또 사라진다.
   */
  it("첨부 지시를 적어도 이 말은 남는다", () => {
    const prompt = buildPosterPrompt({
      ...restyled,
      images: [...restyled.images, { kind: "style_reference" }],
      attachmentIntent: "1번 사람들을 2번 느낌으로",
    });
    expect(prompt).toContain("PRESERVED PERSON, REDRAWN");
    expect(prompt).toContain("glasses");
    // 다른 역할의 규칙도 이제 남는다. 부딪히면 사용자 말이 이긴다.
    expect(prompt).toContain("not its people");
    expect(prompt).toContain("Their words OVERRIDE any rule above");
  });
});

/**
 * **말과 실제가 맞는가.**
 *
 * 전에는 「규칙을 뺐다」고 적어 두고 실제로는 일부를 남겼다. 모델이 남은 것을
 * 「빼려다 만 것」으로 읽을 수 있어 「남는 것도 있다」를 함께 적었다.
 *
 * 2026-09-17 에 **빼지 않기로** 바꿨다. 그러니 「뺐다」는 말도 없어야 한다 —
 * 프롬프트가 자기 자신에 대해 거짓말을 하면 모델이 무엇을 믿을지 모른다.
 */
describe("말과 실제가 맞는가", () => {
  it("뺐다는 말이 안 남았다", () => {
    const prompt = buildPosterPrompt({
      slots: { ...EMPTY_SLOTS, scene: "강가" },
      images: [{ kind: "preserved", subject: "person", restyle: true }],
      attachmentIntent: "1번 사람들을 만화로",
    });

    expect(prompt).not.toContain("deliberately omitted");
    expect(prompt).not.toContain("replace the usual rules");
  });
});

/**
 * **쓴 그대로 보내기.**
 *
 * 완성된 프롬프트를 들고 온 사람은 AI 가 다시 쓰기를 바라지 않는다. 그런데
 * 첨부 번호·크기·역할 지시까지 버리면 안 된다 — 그건 취향이 아니라 계약이고,
 * 틀리면 결과가 나쁜 게 아니라 **틀린 그림**이 나온다(설계 §2.1).
 *
 * 그래서 **④ 장면 구역만** 원문으로 갈아 끼운다. ①②③⑤⑥⑦ 은 그대로 붙는다.
 */
describe("쓴 그대로 보내기", () => {
  const 원문 = "A cat sitting on a wooden chair, morning light from the left window.";

  it("원문이 그대로 들어간다", () => {
    const prompt = buildPosterPrompt({
      slots: EMPTY_SLOTS, images: [], verbatimScene: 원문,
    });

    expect(prompt).toContain(원문);
  });

  /** 슬롯을 안 쓴다 — 기획이 안 돌았으니 채워진 것도 없다. */
  it("슬롯 대신 원문을 쓴다", () => {
    const prompt = buildPosterPrompt({
      slots: { ...EMPTY_SLOTS, scene: "기획이 쓴 장면" },
      images: [],
      verbatimScene: 원문,
    });

    expect(prompt).toContain(원문);
    expect(prompt).not.toContain("기획이 쓴 장면");
  });

  /** **이것이 핵심이다.** 첨부 번호가 빠지면 엉뚱한 그림에 지시가 붙는다. */
  it("첨부 번호와 역할은 그대로 붙는다", () => {
    const prompt = buildPosterPrompt({
      slots: EMPTY_SLOTS,
      images: [{ kind: "preserved", subject: "person" }, { kind: "style_reference" }],
      verbatimScene: 원문,
    });

    expect(prompt).toContain("Image 1");
    expect(prompt).toContain("Image 2");
  });

  it("크기 줄도 그대로 붙는다", () => {
    const prompt = buildPosterPrompt({
      slots: EMPTY_SLOTS, images: [], verbatimScene: 원문,
      size: { width: 1024, height: 1536 },
    });

    expect(prompt).toContain("Output size 1024x1536");
  });

  /** 사용자가 따로 적은 말도 맨 앞·맨 뒤에 그대로 간다. */
  it("추가로 적은 말도 살아 있다", () => {
    const prompt = buildPosterPrompt({
      slots: EMPTY_SLOTS, images: [], verbatimScene: 원문,
      userInstruction: "배경은 밤",
    });

    expect(prompt.split("배경은 밤").length - 1).toBe(2);
  });

  /** 안 넘기면 지금까지대로 슬롯을 쓴다. 옛 작업이 안 깨진다. */
  it("안 넘기면 지금까지대로 슬롯을 쓴다", () => {
    const prompt = buildPosterPrompt({
      slots: { ...EMPTY_SLOTS, scene: "기획이 쓴 장면" }, images: [],
    });

    expect(prompt).toContain("기획이 쓴 장면");
  });

  /** 빈 문자열은 안 넘긴 것과 같다 — 빈 장면으로 보내면 모델이 스스로 채운다. */
  it("빈 원문은 슬롯으로 떨어진다", () => {
    const prompt = buildPosterPrompt({
      slots: { ...EMPTY_SLOTS, scene: "기획이 쓴 장면" }, images: [], verbatimScene: "   ",
    });

    expect(prompt).toContain("기획이 쓴 장면");
  });
});

/**
 * **쓴 그대로일 때 글자를 우리가 금지하면 안 된다.**
 *
 * 「글자를 하나도 안 적었으면 넣지 마라」는 2026-09-08 실측으로 넣은 말이다 —
 * 기획이 글자를 안 만들었는데 모델이 「BEST DAY EVER!」를 박아 넣었다.
 *
 * 그런데 쓴 그대로에서는 **기획이 아예 안 돈다.** 슬롯이 빈 것은 「글자를 안
 * 원한다」가 아니라 **「우리가 안 물어봤다」**는 뜻이다. 그때 금지하면 사용자
 * 프롬프트가 글자를 요구해도 우리가 막는다 — 그 프롬프트를 살리려고 만든
 * 갈래에서(2026-09-16 실물 확인).
 *
 * 글자를 넣을지는 **사용자 프롬프트가 정한다.** 우리는 아무 말도 안 한다.
 */
describe("쓴 그대로일 때의 글자", () => {
  const 원문 = "A movie poster with the title THE LONG NIGHT in large type at the top.";

  it("글자를 금지하지 않는다", () => {
    const prompt = buildPosterPrompt({
      slots: EMPTY_SLOTS, images: [], verbatimScene: 원문,
    });

    expect(prompt).not.toContain("Render it with NO text");
    expect(prompt).not.toContain("Do not add a headline");
  });

  /** 사용자가 적은 글자 요구는 그대로 남는다. */
  it("원문의 글자 요구는 그대로다", () => {
    const prompt = buildPosterPrompt({
      slots: EMPTY_SLOTS, images: [], verbatimScene: 원문,
    });

    expect(prompt).toContain("THE LONG NIGHT");
  });

  /**
   * **다듬어서일 때는 그대로 금지한다.** 2026-09-08 실측이 정한 것이고,
   * 이 변경으로 흔들리면 안 된다.
   */
  it("다듬어서일 때는 지금까지대로 금지한다", () => {
    const prompt = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [] });

    expect(prompt).toContain("Render it with NO text");
  });

  /** 쓴 그대로여도 사람이 04 에서 문구를 적었으면 그것은 실린다. */
  it("적어 둔 문구가 있으면 그것은 실린다", () => {
    const prompt = buildPosterPrompt({
      slots: { ...EMPTY_SLOTS, headline: "가을 사진전" }, images: [], verbatimScene: 원문,
    });

    expect(prompt).toContain("가을 사진전");
  });
});

/**
 * **서버도 화면과 같은 규칙을 지켜야 한다.**
 *
 * 화면은 「레퍼런스가 없으면 레퍼런스 스타일을 못 쓴다」고 말한다. 그런데
 * 서버가 안 막으면 화면을 안 거치는 길로 `auto` 가 그대로 들어온다 — API 직접
 * 호출, 첨부를 다 뺀 옛 작업 다시 돌리기(2026-09-16 실측으로 구멍 확인).
 *
 * `auto` 의 지시문은 빈 문자열이다. 첨부도 없고 지시문도 비면 **그림을 무엇으로
 * 그릴지 정하는 말이 프롬프트에 한 줄도 안 들어간다.**
 */
describe("첨부가 없는데 auto 가 들어오면", () => {
  it("결을 정하는 말이 반드시 실린다", () => {
    const prompt = buildPosterPrompt({
      slots: { ...EMPTY_SLOTS, scene: "해 질 녘 바닷가" },
      images: [],
      look: "auto",
    });

    // 실사로 내려가 사진 지시가 붙는다.
    expect(prompt).toMatch(/photograph|photographic|skin|pore/i);
  });

  /** 첨부가 있으면 지금까지대로 아무 말도 안 보탠다. */
  it("첨부가 있으면 auto 는 그대로 아무 말도 안 보탠다", () => {
    const prompt = buildPosterPrompt({
      slots: { ...EMPTY_SLOTS, scene: "해 질 녘 바닷가" },
      images: [{ kind: "style_reference" }],
      look: "auto",
    });

    expect(prompt).not.toMatch(/subsurface scattering|cel-shaded|brush or ink/i);
  });

  /** 사람이 고른 결은 첨부가 있든 없든 그대로다. */
  it("사람이 고른 결은 안 건드린다", () => {
    const prompt = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [], look: "anime" });

    expect(prompt).toMatch(/cel-shaded/i);
  });
});

/**
 * **글자 칸이 전부 「AI 가 골라 채운 것」이면 사용자는 글자를 안 시킨 것이다.**
 *
 * 전에는 「빈 칸이면 글자를 안 시킨 것」으로 읽었다. 기획이 근거 없는 칸을 비워
 * 뒀기 때문이다. 그런데 기획을 「다 채우게」 바꾸면서 그 신호가 사라졌다 —
 * headline 이 늘 차서 **「글자를 넣지 말라」에 도달할 길이 없어졌다**
 * (2026-09-17 리뷰).
 *
 * 그 자리를 `invented` 가 대신한다. 실측으로 갈리는 것을 확인했다(각 4·3회):
 *
 *   「…헤드라인은 「가을, 셔터를 누르다」」 → headline 은 그대로 옮겨 적고
 *                                        invented 에 **안** 넣는다
 *   「벚꽃 아래에서 손을 흔드는 학생」      → 글자 칸 **셋 다** invented
 *
 * **하나라도 사람 것이면 금지하지 않는다.** 나머지는 기획의 제안이고, 04 에
 * 표가 붙어 있어 사람이 지울 수 있다.
 */
describe("글자가 전부 AI 가 고른 것일 때", () => {
  const 글자칸 = ["headline", "subline", "sideTexts"];

  it("셋 다 AI 것이면 글자를 넣지 말라고 한다", () => {
    const prompt = buildPosterPrompt({ slots, images, size, invented: 글자칸 });

    expect(prompt).toContain("Render it with NO text");
  });

  /** 금지하면서 그 글자를 같이 실으면 앞뒤가 안 맞는다. */
  it("그때 그 글자를 싣지 않는다", () => {
    const prompt = buildPosterPrompt({ slots, images, size, invented: 글자칸 });

    expect(prompt).not.toContain("가을, 셔터를 누르다");
  });

  it("헤드라인이 사람 것이면 금지하지 않는다", () => {
    const prompt = buildPosterPrompt({
      slots, images, size, invented: ["subline", "sideTexts"],
    });

    expect(prompt).not.toContain("Render it with NO text");
    expect(prompt).toContain("가을, 셔터를 누르다");
  });

  /**
   * **헤드라인 하나로만 재면 안 된다.**
   *
   * 여섯 시험이 전부 헤드라인으로 갈려서, 「곁텍스트를 아예 안 센다」거나
   * 「headline 만 본다」는 변이가 다 통과했다(2026-09-17 리뷰). 셋을 각각
   * 사람 것으로 두고 재야 그 판단이 재어진다.
   */
  it("받침 문구만 사람 것이어도 금지하지 않는다", () => {
    const prompt = buildPosterPrompt({
      slots, images, size, invented: ["headline", "sideTexts"],
    });

    expect(prompt).not.toContain("Render it with NO text");
    expect(prompt).toContain("필름으로 담은 도시의 온도");
  });

  it("곁텍스트만 사람 것이어도 금지하지 않는다", () => {
    const prompt = buildPosterPrompt({
      slots, images, size, invented: ["headline", "subline"],
    });

    expect(prompt).not.toContain("Render it with NO text");
    expect(prompt).toContain("28MM F2.0");
  });

  /** 글자 아닌 칸이 AI 것인 건 상관없다. 그림 이야기다. */
  it("글자 아닌 칸만 AI 것이면 금지하지 않는다", () => {
    const prompt = buildPosterPrompt({
      slots, images, size, invented: ["scene", "dominantColor"],
    });

    expect(prompt).not.toContain("Render it with NO text");
  });

  /** 옛 작업에는 이 값이 없다. 지금까지대로 칸이 비었는지로만 본다. */
  it("안 넘기면 지금까지대로다", () => {
    expect(buildPosterPrompt({ slots, images, size })).toContain("가을, 셔터를 누르다");
    expect(buildPosterPrompt({ slots: EMPTY_SLOTS, images, size }))
      .toContain("Render it with NO text");
  });

  /**
   * **쓴 그대로는 여전히 아무 말도 안 한다.** 글자를 넣을지는 사용자 프롬프트가
   * 정한다. 그 갈래는 기획을 안 돌리므로 `invented` 도 비어 있다.
   */
  it("쓴 그대로면 금지하지 않는다", () => {
    const prompt = buildPosterPrompt({
      slots: EMPTY_SLOTS, images, size, verbatimScene: "직접 쓴 프롬프트",
    });

    expect(prompt).not.toContain("Render it with NO text");
  });
});
