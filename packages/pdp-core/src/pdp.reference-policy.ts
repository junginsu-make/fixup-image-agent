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
      "the scene description decides those. Show this same product in a new photograph.",
    "Never redesign, restyle or substitute the product.",
  ],
  person: [
    // "이 사람이 등장한다"고 단정하면 안 된다. 제품 클로즈업처럼 사람을 부르지
    // 않는 섹션에서는 장면 지시와 충돌한다. 정하는 것은 **등장할 경우 누구인가**다.
    "This is the person for this page. Whenever a person appears, it must be recognisably this same person:",
    "  · face and facial geometry, body proportions, hairstyle, skin tone",
    "Their expression, pose, clothing styling and framing follow the scene description.",
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
export function buildReferenceRoleDirective(references: readonly ReferenceImage[]): string {
  if (references.length === 0) return "";

  const lines = [
    `Reference images (${references.length}) are attached in this order. ` +
      "Each has a different job — do not mix them up:",
    "",
  ];

  references.forEach((reference, index) => {
    lines.push(`[Image ${index + 1} — ${ROLE_LABEL[reference.kind]}]`);
    lines.push(...ROLE_RULES[reference.kind]);
    // 서술은 이미지를 대체하지 않는다. 이미지가 전달하지 못한 **쓰임새**를 보탠다.
    // 그래서 규칙 뒤에 붙이고, 무엇에 대한 말인지 한 줄로 밝힌다.
    if (reference.kind === "style" && reference.description?.trim()) {
      lines.push("How this reference uses its design language:");
      lines.push(reference.description.trim());
    }
    lines.push("");
  });

  const hasIdentity = references.some((reference) => isIdentityReference(reference.kind));
  const hasStyle = references.some((reference) => reference.kind === "style");

  if (hasIdentity && hasStyle) {
    lines.push(
      "When they conflict: the product and the person win over the design reference. " +
        "The design reference governs the surrounding design only.",
    );
  }

  return lines.join("\n").trimEnd();
}
