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
