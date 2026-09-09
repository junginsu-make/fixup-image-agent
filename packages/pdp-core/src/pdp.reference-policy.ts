import { attachmentPlacementRule, priorityLine } from "@fixup/shared";
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
  options?: { hasUserInstruction?: boolean },
): string {
  if (references.length === 0) return "";

  const lines = [
    // 첨부를 대충 훑고 기억으로 그리면 라벨 글자가 뭉개지고 색이 어긋난다.
    // "붙어 있으니 알아서 보겠지"가 통하지 않아서 한 줄로 못 박는다.
    STUDY_ATTACHMENTS,
    "",
    `Reference images (${references.length}) are attached in this order. ` +
      "Each has a different job — do not mix them up:",
    "",
  ];

  references.forEach((reference, index) => {
    lines.push(`[Image ${index + 1} — ${ROLE_LABEL[reference.kind]}]`);
    const intent = reference.intent?.trim();
    if (intent) {
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
        "USER INSTRUCTION for this image. The user wrote what to do with it. Their words " +
          "replace the usual rules for this role, so those rules are deliberately omitted. " +
          "Follow this exactly:",
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
    } else {
      lines.push(...ROLE_RULES[reference.kind]);
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

  // 지시를 적어 규칙을 뺀 자리는 더 이상 「지킨 대상」이 아니다. 그대로 세면
  // 「deliberately omitted」와 같은 단락에서 「preserved subject」가 부딪힌다.
  const hasIdentity = references.some(
    (reference) => isIdentityReference(reference.kind) && !reference.intent?.trim(),
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
    const ranking = priorityLine({ hasUserInstruction: true, hasPreserved: hasIdentity });
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
