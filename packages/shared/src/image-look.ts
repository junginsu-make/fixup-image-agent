/**
 * 이미지의 「결」과 사용자 지시 — 다섯 도구가 같은 말을 쓴다.
 *
 * 전에는 캐릭터 만들기만 결을 골랐고, 그 지시문도 캐릭터 안에 있었다.
 * 카드뉴스·이미지·상세페이지·리디자인은 첨부한 레퍼런스의 결을 따라갈 뿐,
 * 「애니로 뽑아 줘」라고 말할 자리가 없었다.
 *
 * 여기 한 곳에 두는 이유는 **다섯 도구가 갈리면 안 되기 때문**이다. 같은
 * 「실사」인데 도구마다 다른 그림이 나오면 사용자는 도구를 못 믿는다.
 */

/**
 * 고를 수 있는 결.
 *
 * `auto` 가 기본이다 — 지금까지의 동작(첨부 레퍼런스의 결을 따라감)이 그대로
 * 유지돼야 쓰던 사람이 안 깨진다. 명시적으로 골랐을 때만 지시문이 들어간다.
 */
export const IMAGE_LOOKS = ["auto", "photoreal", "anime", "3d", "illustration"] as const;
export type ImageLook = (typeof IMAGE_LOOKS)[number];

export const IMAGE_LOOK_LABEL: Record<ImageLook, string> = {
  auto: "레퍼런스 따라가기",
  photoreal: "실사",
  anime: "애니",
  "3d": "3D",
  illustration: "그림",
};

export const IMAGE_LOOK_HINT: Record<ImageLook, string> = {
  auto: "첨부한 그림의 결을 그대로 따라갑니다. 안 고르면 이것입니다",
  photoreal: "사진처럼",
  anime: "셀 셰이딩·굵은 선",
  "3d": "3D 렌더",
  illustration: "손그림 질감",
};

/** 대상이 무엇이냐에 따라 실사 지시가 달라진다. 사람 피부와 동물 털은 다른 말이 필요하다. */
export type LookSubject = "person" | "animal" | "generic";

/**
 * 실사 지시문. **2026-09-04 실측으로 고른 문구다.**
 *
 * 같은 묘사로 세 벌을 뽑아 견줬다(nano-banana-pro, 3:4).
 *   1. 없음        — 잡티는 보이나 무난
 *   2. 앞 문단만   — 셋 중 가장 매끈했다. 요구한 방향과 반대
 *   3. 둘 다(이것) — 주근깨·모공·톤 얼룩이 뚜렷하고 밀랍 느낌은 없다
 *
 * 뒤 문단이 힘을 낸다. `hyperrealistic` 같은 모호한 강조어 대신 **무엇이
 * 고품질인지 이름을 대는 말**이라 기존의 "artificially exaggerated pores 를
 * 피하라"와 부딪히지 않는다.
 */
/**
 * 사람 피부. **모공·솜털은 사람에게만 말한다** — 고양이에게 사람 모공을
 * 요구하면 이상해진다(pdp.character.test.ts 가 이걸 지킨다).
 */
const PHOTOREAL_PERSON =
  "Render believable unretouched human skin with visible fine pores, subtle vellus hair," +
  " gentle local skin-tone variation, faint natural blemishes, realistic under-eye and lip" +
  " texture, and physically plausible highlights. Avoid beauty filters, airbrushing," +
  " porcelain, waxy or plastic skin, excessive smoothing, CGI skin and artificially" +
  " exaggerated pores." +
  " Realism: this must read as a real photograph shot by a professional — natural skin" +
  " texture with visible pores and fine hair, real fabric weave, honest depth of field," +
  " light that behaves physically. It must NOT look like a 3D render, CGI, an illustration," +
  " or a generic stock photo. Avoid waxy over-smoothed skin, plastic surfaces, symmetrical" +
  " staged smiles, and the sterile evenly-lit look that gives AI images away.";

/** 사람 몸 이야기를 뺀 실사 문단. 동물·사물·장면에 쓴다. */
const PHOTOREAL_NEUTRAL =
  "Realism: this must read as a real photograph shot by a professional — believable" +
  " material surfaces, fine texture detail, real fabric weave, honest depth of field," +
  " light that behaves physically. It must NOT look like a 3D render, CGI, an illustration," +
  " or a generic stock photo. Avoid plastic surfaces and the sterile evenly-lit look that" +
  " gives AI images away.";

const PHOTOREAL_ANIMAL =
  "Render individual fur strands, natural coat sheen and physically plausible light." +
  " Avoid a plush-toy or CGI look. " + PHOTOREAL_NEUTRAL;

/**
 * 강도를 올리는 마지막 한 줄. 세 대상 모두에 붙는다.
 *
 * `hyperrealistic` 같은 모호한 강조어 대신 **무엇이 고품질인지 이름을 대는 말**이다.
 * 이 한 줄이 실측에서 질감을 올린 부분이다.
 */
const PHOTOREAL_ULTRA =
  " Ultra-detailed photographic realism, shot on a full-frame camera with a prime lens." +
  " Every texture resolved — surface grain, fabric weave, fine detail.";

const LOOK_DIRECTIVE: Record<Exclude<ImageLook, "auto" | "photoreal">, string> = {
  anime:
    "Render in a clean anime / cel-shaded style: flat colour areas, crisp line art, simple" +
    " shadow shapes and a limited palette. Confident, even line weight and deliberate negative" +
    " space, at the finish level of a theatrical anime key frame. No photographic texture," +
    " no 3D shading, no airbrushed gradients.",
  // 「품질 높음」은 모델이 못 알아듣는다. 무엇이 고품질인지 이름을 대야 움직인다.
  "3d":
    "Render as a feature-film quality 3D animation frame: physically based materials," +
    " subsurface scattering on skin, ray-traced soft shadows, soft global illumination," +
    " shallow depth of field with clean bokeh, crisp anti-aliased edges and gently rounded" +
    " appealing forms. The polish of a major animation studio release — never a game-engine" +
    " screenshot, a clay render, or a low-poly mockup.",
  illustration:
    "Render as a hand-drawn illustration with visible brush or ink strokes, slightly uneven" +
    " line weight, layered pigment and painted texture. Deliberate, confident marks rather" +
    " than smooth vector fills. No photographic realism, no 3D shading.",
};

/**
 * 결 지시문을 만든다. `auto` 면 빈 문자열 — 아무 말도 보태지 않는다.
 *
 * 넣을지 말지를 부르는 쪽이 판단하게 두지 않는다. 다섯 군데가 각자 판단하면
 * 언젠가 한 곳이 어긋난다.
 */
export function imageLookDirective(look: ImageLook, subject: LookSubject = "generic"): string {
  if (look === "auto") return "";
  if (look !== "photoreal") return LOOK_DIRECTIVE[look];
  const body = subject === "person" ? PHOTOREAL_PERSON
    : subject === "animal" ? PHOTOREAL_ANIMAL
      : PHOTOREAL_NEUTRAL;
  return body + PHOTOREAL_ULTRA;
}

/**
 * 사용자가 직접 친 말을 프롬프트 **맨 앞**에 놓는 블록.
 *
 * 지금까지 포스터·카드뉴스는 `scene description` 을 우선순위 맨 아래에 두었다.
 * 사용자가 "배경을 밤으로"라고 적어도 첨부한 레퍼런스가 낮이면 레퍼런스가
 * 이겼다. 뒤집는다 — 사람이 직접 친 말이 가장 세다.
 */
export function userInstructionHead(instruction: string): string {
  const trimmed = instruction.trim();
  if (!trimmed) return "";
  return `USER INSTRUCTION (highest priority — follow exactly):\n${trimmed}`;
}

/**
 * 같은 지시를 프롬프트 **맨 뒤**에서 다시 못 박는 블록.
 *
 * 두 번 넣는 이유가 있다. 2026-09-04 실측에서 프롬프트 뒤에 문단을 덧붙였더니
 * **앞쪽의 구도 지시가 밀려** 전신으로 뽑으라는 말이 무시됐다. 긴 프롬프트에서
 * 중간 문장은 힘을 잃는다. 그래서 가장 중요한 것은 양끝에 둔다.
 */
export function userInstructionTail(instruction: string): string {
  const trimmed = instruction.trim();
  if (!trimmed) return "";
  return `Before drawing, re-read the USER INSTRUCTION and make sure it is satisfied: ${trimmed}`;
}

/**
 * 충돌할 때 무엇이 이기는가.
 *
 * 사용자 지시가 맨 위다. 그 다음이 지켜야 할 대상(제품·인물) — 이건 정체성이라
 * 양보하면 다른 물건이 된다. 레퍼런스는 그 아래다.
 */
export function priorityLine(options: { hasUserInstruction: boolean; hasPreserved: boolean }): string {
  const ranks = [
    options.hasUserInstruction ? "the USER INSTRUCTION" : "",
    options.hasPreserved ? "the PRESERVED SUBJECT" : "",
    "the REFERENCE image",
    "the scene description",
  ].filter(Boolean);
  if (ranks.length < 2) return "";
  return `Priority when instructions conflict: ${ranks.join(" > ")}.`;
}

/**
 * 그리는 사람이 누구인가 — 프롬프트 **맨 앞**에 서는 한 줄.
 *
 * 역할을 안 주면 모델이 「무난한 것」으로 수렴한다. 세계적인 디자이너·
 * 일러스트레이터의 자리에 세우면, 같은 지시로도 판단의 기준이 올라간다.
 *
 * 다섯 도구가 같은 문장을 쓴다. 도구마다 다른 사람을 세우면 결과의 격이
 * 도구마다 갈린다.
 *
 * **지시를 이기라는 말이 아니다.** 아래 두 줄로 못 박는다 — 아무리 좋은
 * 디자이너라도 받은 지시를 자기 취향으로 바꾸면 그건 다른 결과물이다.
 */
export function designerPersona(): string {
  return [
    "You are a world-class art director, graphic designer and illustrator.",
    "Work at the level of an award-winning studio: deliberate composition, confident typography,",
    "intentional colour, and craft in every detail. Never settle for a generic, templated look.",
    "Craft is how you execute the brief — it never overrides it. Follow every instruction below exactly;",
    "do not substitute your own taste for what was asked, and do not add elements nobody asked for.",
  ].join("\n");
}

/**
 * 지켜야 할 대상을 **그대로** 지키라는 지시.
 *
 * 전에는 「각도와 빛은 바뀌어도 된다」까지만 적었다. 그 말이 문을 너무 넓게
 * 열었다 — 2026-09-04 사용자 보고에서 제품과 인물이 「약간 변형되어」 나왔다.
 * 모델은 「바뀌어도 되는 것」이 있으면 나머지도 조금씩 손본다.
 *
 * 그래서 **무엇이 바뀌어도 되는지를 좁히고**, 바뀌면 안 되는 것을 낱낱이
 * 적는다. 그리고 「새로 디자인하지 말라」를 따로 못 박는다 — 모델에게
 * 「같은 물건을 그려라」와 「이 물건을 그려라」는 다른 말이다.
 */
/**
 * 사람은 그대로 두되 **그림 느낌만** 바꾸라는 지시.
 *
 * `preserveDirective("preserve-person")` 은 `restyle` 을 금지한다 — 그림 느낌까지
 * 고정하는 것이 그 지시의 뜻이다. 그래서 「이 사람들을 만화로」는 그 지시로도,
 * 「따라 만들기」(사람을 아예 새로 만든다)로도 표현이 안 됐다(설계 §4-3).
 *
 * ── 왜 하나하나 세라고 적나 ──────────────────────────────────
 *
 * 2026-09-08 실측에서 사진 다섯 명을 만화로 바꿨더니 사람은 나왔는데 **세 번째
 * 사람의 안경이 몇 번을 돌려도 안 나왔다.** 그때 프롬프트에 있던 인물 묘사는
 * 기획이 쓴 한 줄 요약(「흰색 티셔츠 착용」)뿐이었다. 요약에 없는 것은 안
 * 그려진다.
 *
 * 그래서 **작은 것을 이름으로 부른다** — 안경·모자·옷의 프린트·시계·신발.
 * 「그대로 재현하라」만 적으면 모델은 큰 것(얼굴·옷)만 옮기고 작은 것을 버린다.
 * 그리고 **한 명씩 확인하라**고 못 박는다: 여럿이 있으면 전체 인상만 맞추고
 * 개인을 뭉갠다.
 */
export function restyledPersonDirective(): string {
  return [
    "Reproduce these exact people, redrawn in the rendering style described elsewhere in this prompt.",
    "Their identity must survive the change of style: the same number of people, each one in the same",
    "position, and each person's own face — face shape, eye shape, nose, mouth, jawline, skin tone,",
    "hairstyle and hair colour, and body proportions — recognisably theirs in the new style.",
    "Keep every accessory and garment each person is actually wearing in the attached photo:",
    "glasses, sunglasses, hats and caps, what is printed on their clothes, jewellery, watches, shoes.",
    "Go through the people one at a time and check each one against the photo — do not drop an item",
    "because it is small, and do not give an item to someone who is not wearing it.",
    "Only the drawing medium may change (photographic → illustrated / anime / 3D, and the line,",
    "shading and colour treatment that comes with it).",
    "Do not swap, merge, beautify, slim, age or de-age anyone, and do not add a person who is not there.",
    "Someone who knows these people must recognise each of them in the result.",
  ].join(" ");
}

export function preserveDirective(role: "preserve-person" | "preserve-object"): string {
  if (role === "preserve-person") {
    return [
      "Reproduce this exact person — their identity must survive unchanged.",
      "Facial structure, eye shape, nose, mouth, jawline, skin tone,",
      "hairstyle and hair colour, and body proportions must match the attached photo feature by feature.",
      "Only the pose, expression, framing and lighting may differ to fit the scene.",
      "Do not beautify, slim, age, de-age, restyle or 'improve' them, and do not blend in another face.",
      "Someone who knows this person must recognise them immediately.",
    ].join(" ");
  }
  return [
    "Reproduce this exact object — its identity must survive unchanged.",
    "Silhouette, proportions, colours, materials, surface finish,",
    "seams, hardware, labels, logos and any text on it must match the attached photo detail for detail.",
    "Only the camera angle, placement and lighting may differ to fit the scene.",
    "Do not redesign, restyle, simplify, embellish or change its branding — it is not a similar product,",
    "it is this product.",
  ].join(" ");
}

/**
 * 첨부한 것이 결과의 **어디에** 놓이는지 정하라는 지시.
 *
 * 자리를 안 정해 주면 모델이 매번 다르게 놓는다. 지킬 대상이 구석에 작게
 * 들어가 버리면 지킨 보람이 없고, 레퍼런스가 주인공 자리를 차지하면 따라
 * 그리라고 준 것이 그대로 베껴진다.
 */
export function attachmentPlacementRule(hasPreserved: boolean): string {
  if (!hasPreserved) {
    return "Decide a deliberate placement for every element you draw — nothing floats without a reason.";
  }
  return [
    "Give each preserved subject an explicit, deliberate place in the composition:",
    "decide where it sits, how large it reads, what overlaps it, and how the eye reaches it.",
    "A preserved subject must be clearly visible and legible at a glance — never cropped away,",
    "never buried behind other elements, never reduced to a tiny detail.",
  ].join(" ");
}
