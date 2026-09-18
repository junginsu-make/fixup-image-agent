import { attachmentPlacementRule, characterAngleDirective, priorityLine } from "@fixup/shared";
import type { AnchorRole } from "./pdp.product-anchor";
import type { ReferenceImage } from "./types";

/**
 * 참조 이미지 정책 — 이 시스템의 필수 규칙.
 *
 * 참조는 "무엇을 넣는가"가 아니라 **"얼마나 그대로 가져오는가"** 로 갈린다.
 * 이 구분이 무너지면 제품이 다른 물건이 되거나, 인물 얼굴이 매 섹션 바뀌거나,
 * 레퍼런스가 통째로 복사돼 남의 페이지가 된다.
 *
 * ## 세 자리
 *
 * | 자리 | `kind` | 어떻게 |
 * |---|---|---|
 * | 제품 | `anchor` | **정체성 유지** — 형태·색·재질·라벨. 각도·구도는 장면이 정한다 |
 *
 * `anchor` 는 2026-09-18(U-03)부터 세 갈래다 — `anchorRole` 이 정한다.
 *
 * | `anchorRole` | 언제 | 무엇을 지키나 |
 * |---|---|---|
 * | `identity`(기본) | 실물 사진 + 보존 켬, 또는 레퍼런스 없음 | 형태·색·재질·라벨 |
 * | `shape-only` | 실물 사진 + 보존 끔 + 레퍼런스 있음 | 형태·라벨 글자. 색은 레퍼런스 |
 * | `mood-only` | 글 경로의 **만들어 낸** 대표 이미지 | 결뿐. 그 안의 물건·글자는 안 가져온다 |
 *
 * **`shape-only` 는 아직 실측하지 않았다.** 아래 2026-07-30 표는 오히려 반대
 * 방향을 가리킨다 — 지시문은 정체성을 **못 풀었다**. 그래도 그쪽을 고른 이유는
 * `pdp.product-anchor.ts` 머리말에 적었다.
 * | 인물·캐릭터 | `person` | **정체성 유지** — 얼굴·체형. 표정·자세는 장면이 정한다 |
 * | 디자인 레퍼런스 | `style` | **모방만** — 레이아웃·분위기·색·서체. 그 안의 물건·사람은 가져오지 않는다 |
 *
 * ## 이미지는 그대로 첨부한다. 단, 디자인 레퍼런스만 서술을 곁들인다.
 *
 * fal 이 연동한 모델들(gpt-image-2, nano-banana 계열)은 참조 이미지를 그대로 받는다
 * (`image_urls`). 그래서 이미지를 텍스트로 **대체**할 필요가 없다.
 *
 * 필요한 것은 **"몇 번째 이미지가 무엇이고 어떻게 다뤄야 하는가"** 다.
 * 첨부 순서는 코드가 정하므로(`pdp.service.ts`) 그 순서를 그대로 프롬프트에 적는다.
 *
 * ### 정체성은 이미지가 지킨다. 색의 쓰임새는 문장이 있어야 전달된다.
 *
 * 실측(2026-07-30, gpt-image-2, 조건당 2장)으로 갈렸다. 레퍼런스는 짙은 올리브를
 * **면(배경)** 으로 쓰는 디자인이었다.
 *
 * | 조건 | 올리브를 면으로 썼나 |
 * |---|---|
 * | 역할 지시문만 (이미지만) | 0/2 — 글자색으로만 썼다 |
 * | 분석 서술만 (예전 방식) | 2/2 |
 * | 역할 지시문 + 분석 서술 | 2/2 |
 *
 * 제품·인물의 정체성은 세 조건 모두 6/6 유지됐다. **제품 보존 지시가 아예 없는
 * 조건에서도** 유지됐다 — 정체성은 첨부된 이미지가 지킨다. 설명이 필요 없다.
 *
 * 반면 "이 색을 면으로 쓸지 글자로 쓸지"는 이미지만으로 전달되지 않았다.
 * `colour palette` 라고만 말하면 모델은 색만 집어 오고 쓰임새는 스스로 정한다.
 * 그래서 **`style` 참조에만** 서술을 곁들인다.
 *
 * ## 우선순위
 *
 * ```
 * 제품(anchor) = 인물(person)  >  스타일(style)  >  장면 지시(prompt)
 * ```
 *
 * 같은 등급 안에서 인물은 하나만 쓴다 — 업로드한 사진이 있으면 캐릭터는 쓰지 않는다.
 * 얼굴이 둘이면 모델이 절충해 제3의 인물을 만든다.
 *
 * ## 지키는 것과 지키지 않는 것을 구분해 말해야 한다
 *
 * "exact shape, proportions" 처럼만 쓰면 모델이 **찍힌 각도까지 복사**한다. 그러면
 * 섹션마다 같은 구도가 나와 딱딱해진다. 지켜야 할 것은 **그 물건·그 사람이라고
 * 알아볼 수 있는 정체성**이고, 카메라 각도·거리·배경·조명은 장면 지시의 몫이다.
 */

export type ReferenceRole = ReferenceImage["kind"];

/** 그대로 지켜야 하는 참조인가. */
export function isIdentityReference(role: ReferenceRole): boolean {
  return role === "anchor" || role === "person";
}

/**
 * **형태만 지키는 제품 규칙**(U-03).
 *
 * 디자인 레퍼런스를 온전히 따르기로 한 경우다. 전에는 이때 **제품 사진을 아예
 * 안 보냈고**, 그래서 모델이 제품을 지어냈다. 이제는 보내되 **무엇을 양보할지**
 * 를 말한다.
 *
 * 양보하는 것: 색·마감·질감. 지키는 것: **형태와 라벨 글자.** 글자가 바뀌면
 * 그건 다른 제품이고, 없는 브랜드를 지어낸 것이 된다.
 */
const ANCHOR_SHAPE_ONLY: string[] = [
  "This is the product. Keep its form and its text, but let the design reference decide its colours:",
  "  · silhouette and defining features, real proportions of the object itself " +
    "(a tall slim bottle must not become short and wide)",
  "  · every logo, label and package text, spelled exactly as shown",
  "Its colour palette, finish and material may be restyled to match the design reference. " +
    "Nothing else about it may change.",
  "Do NOT copy the reference's camera angle, crop, distance, background or lighting — " +
    "the scene description decides those. Show this same product in a newly composed image.",
  "Never substitute a different product, and never invent one. This is the product being sold.",
];

/**
 * **만들어 낸 대표 이미지용 규칙**(U-03).
 *
 * 글 경로의 앵커는 우리가 만든 그림이다. 거기엔 헤드라인 글자와 임의의 소품이
 * 박혀 있어서, 「판매 중인 제품, 라벨 글자까지 지켜라」로 선언하면 **그 글자가
 * 페이지 전체에 되풀이된다.**
 *
 * 이 그림이 정하는 것은 **페이지의 결**뿐이다.
 */
const ANCHOR_MOOD_ONLY: string[] = [
  "This is the page's key visual, made for this page. It sets the visual tone only:",
  "  · colour mood, lighting, texture and overall feeling",
  "Do NOT treat anything inside it as a real product or a real person. " +
    "Do not reproduce its text, logos, props or specific objects.",
  "Do NOT copy its camera angle, crop, distance, background or composition — " +
    "the scene description decides those.",
];

const ROLE_RULES: Record<ReferenceRole, string[]> = {
  anchor: [
    "This is the product. Keep it recognisably the same product:",
    "  · silhouette and defining features, real proportions of the object itself " +
      "(a tall slim bottle must not become short and wide)",
    "  · colour, finish and material",
    "  · every logo, label and package text, spelled exactly as shown",
    "Do NOT copy the reference's camera angle, crop, distance, background or lighting — " +
      // 「new photograph」이라고 못 박으면 애니·그림 결을 골랐을 때 결 지시와
      // 부딪힌다. 여기서 정할 것은 **같은 제품을 새로 그린다**는 것뿐이다.
      // 사진이냐 아니냐는 결(look)이 정한다.
      "the scene description decides those. Show this same product in a newly composed image.",
    "Never redesign, restyle or substitute the product.",
    // 2026-09-04 사용자 보고: 제품이 「약간 변형되어」 나왔다. 「같은 제품」은
    // 모델에게 「비슷한 제품」으로도 읽힌다. 그 문을 닫는다.
    "Match seams, hardware and surface finish as well — this is not a similar product, " +
      "it is this exact product. Its identity must survive unchanged.",
  ],
  person: [
    // "이 사람이 등장한다"고 단정하면 안 된다. 제품 클로즈업처럼 사람을 부르지
    // 않는 섹션에서는 장면 지시와 충돌한다. 정하는 것은 **등장할 경우 누구인가**다.
    "This is the person for this page. Whenever a person appears, it must be recognisably this same person:",
    "  · face and facial geometry, body proportions, hairstyle, skin tone",
    "Their expression, pose, clothing styling and framing follow the scene description.",
    // 같은 보고에서 인물도 변형됐다. 「같은 사람」만으로는 모델이 손을 본다.
    "Do not beautify, slim, age, de-age or restyle them, and never blend in another face. " +
      "Someone who knows this person must recognise them immediately.",
  ],
  style: [
    "This is a design reference. Imitate its design language only:",
    "  · layout and composition, colour palette, typography (weight, width, character), " +
      "text treatment, overall mood and theme",
    "  · how each colour is used — which colours fill surfaces and bands, which are only " +
      "type, which are accents. Reproduce that usage, not just the colours themselves.",
    "Do NOT copy anything else from it — not its product, not its people, not its text " +
      "content, not its specific scene. Nothing from this image appears literally in the output.",
  ],
};

/**
 * 첨부를 실제로 보라는 한 줄. 다섯 도구가 같은 문장을 쓴다.
 *
 * 모델은 첨부가 있어도 "이런 종류의 그림"을 기억에서 꺼내 그리는 쪽으로 쏠린다.
 * 그러면 라벨 글자가 비슷한 다른 글자가 되고, 색도 근처 색으로 바뀐다.
 */
const STUDY_ATTACHMENTS =
  "Study every attached image closely before drawing. They are the source of truth for what" +
  " they define — reproduce what you actually see in them. Do not approximate them from" +
  " memory, and never substitute a generic stand-in.";

const ROLE_LABEL: Record<ReferenceRole, string> = {
  anchor: "PRODUCT",
  person: "PERSON",
  style: "DESIGN REFERENCE",
};

/**
 * 첨부한 이미지들의 역할과 다루는 법을 프롬프트로 적는다.
 *
 * 순서는 `references` 배열 그대로다 — 호출자가 담은 순서가 fal 에 가는 순서이므로
 * 여기서 번호를 매기면 어긋나지 않는다.
 *
 * @returns 첨부가 없으면 빈 문자열.
 */
export function buildReferenceRoleDirective(
  references: readonly ReferenceImage[],
  options?: {
    hasUserInstruction?: boolean;
    /**
     * 제품 참조를 얼마나 지킬 것인가(→ `pdp.product-anchor.ts` 의 `anchorRoleFor`).
     *
     * **안 주면 `identity` 다.** 옛 호출자가 조용히 보존을 잃으면 안 된다.
     */
    anchorRole?: AnchorRole;
  },
): string {
  if (references.length === 0) return "";

  const rulesFor = (role: ReferenceRole): string[] => {
    if (role !== "anchor") return ROLE_RULES[role];
    // 안 주면 `identity` 다. 옛 호출자가 조용히 보존을 잃으면 안 된다.
    if (options?.anchorRole === "shape-only") return ANCHOR_SHAPE_ONLY;
    if (options?.anchorRole === "mood-only") return ANCHOR_MOOD_ONLY;
    return ROLE_RULES.anchor;
  };

  const lines = [
    // 첨부를 대충 훑고 기억으로 그리면 라벨 글자가 뭉개지고 색이 어긋난다.
    // "붙어 있으니 알아서 보겠지"가 통하지 않아서 한 줄로 못 박는다.
    STUDY_ATTACHMENTS,
    "",
    `Reference images (${references.length}) are attached in this order. ` +
      "Each has a different job — do not mix them up:",
    "",
  ];

  /**
   * 디자인 레퍼런스가 여럿이면 **한 페이지를 나눈 조각들**이다.
   *
   * 긴 상세페이지는 중간에 다른 느낌·다른 디자인이 들어간다. 맨 위 한 장만
   * 보내면 그 페이지를 「어두운 히어로 하나」로 읽는다. 그래서 조각을 다 보낸다.
   *
   * 그냥 여러 장으로 던지면 모델이 **서로 다른 레퍼런스 넷**으로 읽고 절충한다.
   * 몇 번째 조각인지 알려야 이어 읽고, 이 섹션에 맞는 대목을 고른다.
   */
  const styleCount = references.filter((reference) => reference.kind === "style").length;
  let stylePart = 0;

  references.forEach((reference, index) => {
    const isSlice = reference.kind === "style" && styleCount > 1;
    if (isSlice) stylePart += 1;
    lines.push(
      isSlice
        ? `[Image ${index + 1} — ${ROLE_LABEL[reference.kind]}, part ${stylePart} of ${styleCount}]`
        : `[Image ${index + 1} — ${ROLE_LABEL[reference.kind]}]`,
    );
    const intent = reference.intent?.trim();
    if (intent) {
      if (isIdentityReference(reference.kind)) lines.push(...rulesFor(reference.kind));
      /**
       * **설계 4-1 A안 — 자리별로.**
       *
       * 사용자가 이 그림에 대해 적었으면 이 자리의 고정 문구를 통째로 뺀다.
       * 우선순위 한 줄로는 못 이긴다 — 반대편이 여섯 문장이고 전부 구체적이다.
       *
       * **번호와 역할 이름은 남긴다.** 빼면 이 말이 무엇을 가리키는지 사라진다.
       *
       * 포스터와 다른 점: 거기는 첨부 지시가 하나라 적는 순간 모든 역할 문구가
       * 함께 빠진다. 설계 문서가 걱정한 것이 그것이다 — 「왼쪽에 놓아 줘」만
       * 써도 얼굴 지키기가 풀린다. 여기는 자리마다 받으므로 그 걱정이 없다.
       */
      lines.push(
        // 이름을 붙인다. 우선순위 줄이 「USER INSTRUCTION 이 1등」이라고 말하는데
        // 그 이름의 블록이 없으면, 없는 것을 1등으로 올려 둔 셈이 된다.
        isIdentityReference(reference.kind)
          ? "USER INSTRUCTION for composition and pose. Keep all identity constraints above; never change the product or character to satisfy this instruction:"
          : "USER INSTRUCTION for this design reference. Follow the requested design treatment only; do not import its product or people:",
      );
      lines.push(intent);
      /**
       * **푸는 것은 이 자리의 역할 문구뿐이다.**
       *
       * 그림의 결(`look`)과 텍스트 정책은 다른 곳에서 정해져 시스템 프롬프트와
       * JSON 에 따로 실린다. 그래서 「이 제품을 만화풍으로」라고 적으면 제품
       * 보호는 풀리지만 `Realism: produce a real photograph` 는 그대로 남아
       * 요청이 여전히 막힌다 — 2026-09-09 독립 리뷰가 실측으로 확인했다.
       *
       * 그런 요청은 화면에서 결을 함께 바꾸도록 안내한다. 여기서 결까지 풀면
       * 「배치를 왼쪽으로」 한 줄에 사진이 만화가 되는 일이 생긴다.
       */
    } else if (!isSlice || stylePart === 1) {
      // 조각마다 같은 규칙을 되풀이하면 프롬프트가 규칙으로 찬다. 첫 조각에서
      // 한 번만 말하고, 나머지 조각은 번호로만 잇는다.
      lines.push(...rulesFor(reference.kind));
      if (isSlice) {
        lines.push(
          `The ${styleCount} DESIGN REFERENCE images are slices of ONE long detail page, ` +
            "top to bottom, in order. Read them as a single page. Different parts may look " +
            "different — use the part that matches the section being made.",
        );
      }
    }
    // 서술은 이미지를 대체하지 않는다. 이미지가 전달하지 못한 **쓰임새**를 보탠다.
    // 그래서 규칙 뒤에 붙이고, 무엇에 대한 말인지 한 줄로 밝힌다.
    if (reference.kind === "style" && reference.description?.trim()) {
      // 서술은 기계가 읽어 적은 것이고 지시는 사람이 쓴 것이다. 「배치는 무시해
      // 주세요」 뒤에 배치 서술이 그냥 붙으면 방금 뺐다고 한 말이 거짓이 된다.
      lines.push(
        intent
          ? "How this reference uses its design language (context only — the instruction above wins):"
          : "How this reference uses its design language:",
      );
      lines.push(reference.description.trim());
    }
    lines.push("");
  });

  /**
   * 인물 참조가 여럿이면 **한 사람의 여러 각도**다.
   *
   * 2026-07-30 실측에서 얼굴 참조가 둘이면 모델이 절충해 제3의 인물을 만들었다.
   * 그래서 오래 한 장만 보냈고, 정면을 만들어 둬도 상세페이지·리디자인은 안
   * 집어 갔다(2026-09-15 사용자 보고).
   *
   * 지금은 몇 장 보낼지 사람이 고른다. 우리가 대신 판단하지 않는 대신 **말로**
   * 막는다 — 같은 사람이고, 참고일 뿐이니 포즈·구도·배경은 베끼지 말고, 사람은
   * 하나만 그려라. 카드뉴스·포스터와 **같은 문장**을 쓴다(`@fixup/shared`).
   * 두 곳이 다른 말을 하면 같은 캐릭터가 도구마다 다르게 나온다.
   *
   * 한 장일 때는 안 적는다. 없는 각도를 찾게 만든다.
   */
  const personCount = references.filter((reference) => reference.kind === "person").length;
  if (personCount > 1) lines.push(characterAngleDirective(personCount), "");

  // 지시를 적어 규칙을 뺀 자리는 더 이상 「지킨 대상」이 아니다. 그대로 세면
  // 「deliberately omitted」와 같은 단락에서 「preserved subject」가 부딪힌다.
  const hasIdentity = references.some(
    (reference) => isIdentityReference(reference.kind),
  );
  // 지킨 것이 구석에 작게 들어가면 지킨 보람이 없다. 자리를 정하게 한다.
  lines.push(attachmentPlacementRule(hasIdentity), "");
  const hasStyle = references.some((reference) => reference.kind === "style");

  // 사람이 직접 친 말이 맨 위다. 그 아래는 지금까지의 서열을 그대로 둔다 —
  // 제품·인물이 레퍼런스를 이기는 것은 정체성 보존이라 양보할 수 없다.
  //
  // **사용자 지시가 있을 때만** 적는다. 없으면 이 줄이 남기는 말은
  // "레퍼런스 > 장면 지시"뿐인데, 상세페이지에서 장면을 정하는 것은 섹션
  // 블루프린트다. 레퍼런스가 그것을 이긴다고 말하면 style 역할 규칙과 부딪힌다.
  // 자리에 적은 말도 사람이 직접 친 말이다. 그것만 있고 「추가 지시」가 비어
  // 있어도 서열을 밝혀야 한다 — 안 그러면 적은 말이 규칙 아래로 읽힌다.
  const hasSlotIntent = references.some((reference) => Boolean(reference.intent?.trim()));
  if (options?.hasUserInstruction || hasSlotIntent) {
    const ranking = priorityLine({ hasUserInstruction: true, hasPreserved: hasIdentity, identityFirst: true });
    if (ranking) lines.push(ranking);
  }

  if (hasIdentity && hasStyle) {
    lines.push(
      "When they conflict: the product and the person win over the design reference. " +
        "The design reference governs the surrounding design only.",
    );
  }

  return lines.join("\n").trimEnd();
}
