/**
 * 첨부 이미지의 역할 — 세 도구가 같은 말을 쓴다.
 *
 * 카드뉴스·포스터·상세페이지가 각자 다른 어휘로 같은 것을 부르고 있었다.
 *
 *   카드뉴스   style_reference / keep_identity(+person|object) / place_as_is / ending
 *   포스터     style_reference / preserved
 *   상세페이지  style / anchor / person
 *
 * 어휘가 셋이면 라이브러리에서 같은 그림을 불러와도 도구를 옮길 때마다 역할이
 * 초기화된다. 사용자는 같은 판단을 세 번 한다.
 *
 * 나누는 기준은 **얼마나 그대로 가져오는가** 하나다(2026-07-30 실측,
 * pdp-core/src/pdp.reference-policy.ts).
 *
 *   생김새를 가져온다 → 그냥 첨부하면 지켜진다. 설명이 필요 없다
 *   꼴을 가져온다     → 문장을 곁들여야 전달된다
 *
 * 도구 고유의 것(카드뉴스의 표지·속지 자리, 마지막 장)은 여기 두지 않는다.
 * 그건 역할이 아니라 **자리**다.
 */

export type AttachmentRole =
  | "style"             // 꼴만 따라간다 — 레이아웃·서체·색
  | "preserve_product"  // 제품·로고·물건의 생김새를 지킨다
  | "preserve_person"   // 인물의 얼굴·체형을 지킨다
  /**
   * 사람은 그대로 두되 **그림 느낌만** 다른 첨부를 따라간다.
   *
   * 「인물 지키기」와 「따라 만들기」 어느 쪽으로도 표현이 안 되던 조합이다
   * (설계 §4-3, 2026-09-08 사용자 결정). 지키기는 그림 느낌까지 고정하고
   * (`restyle` 을 금지한다), 따라 만들기는 사람을 아예 새로 만든다.
   *
   * **실측이 이 옵션을 불렀다.** 사진 다섯 명을 만화로 바꿨더니 사람은 나왔는데
   * 세 번째 사람의 안경이 몇 번을 돌려도 안 나왔다. 프롬프트 어디에도 「하나하나
   * 그대로 옮겨라」가 없었기 때문이다.
   */
  | "preserve_person_restyled"
  | "place_as_is";      // 모델을 안 거치고 원본 그대로 넣는다

export const ATTACHMENT_ROLE_LABEL: Record<AttachmentRole, string> = {
  style: "따라 만들기",
  preserve_product: "제품 그대로 지키기",
  preserve_person: "인물 그대로 지키기",
  preserve_person_restyled: "사람은 그대로, 그림 느낌만",
  place_as_is: "원본 그대로 넣기",
};

/** 화면에서 한 줄로 설명할 때 쓴다. */
export const ATTACHMENT_ROLE_HINT: Record<AttachmentRole, string> = {
  style: "레이아웃·서체·색만 가져오고 내용은 새로 만듭니다",
  preserve_product: "형태·색·재질·라벨을 그대로 유지합니다",
  preserve_person: "얼굴과 체형을 그대로 유지합니다",
  preserve_person_restyled: "얼굴·안경·모자·옷차림은 그대로 두고, 그림 느낌만 다른 첨부를 따라갑니다",
  place_as_is: "AI 를 거치지 않고 원본을 그대로 배치합니다",
};

/* ── 카드뉴스 ─────────────────────────────────────────────── */

type CardNewsKind = "style_reference" | "keep_identity" | "place_as_is" | "ending";
type Subject = "person" | "object";

export function toCardNewsAttachment(
  role: AttachmentRole,
): { kind: CardNewsKind; subject?: Subject } {
  // 카드뉴스는 아직 「그림 느낌만 바꾸기」를 모른다(설계 §3 3단계). 가장 가까운
  // 것으로 보낸다 — 사람을 잃는 것보다 그림 느낌이 안 바뀌는 편이 덜 나쁘다.
  if (role === "preserve_person" || role === "preserve_person_restyled") {
    return { kind: "keep_identity", subject: "person" };
  }
  if (role === "preserve_product") return { kind: "keep_identity", subject: "object" };
  if (role === "place_as_is") return { kind: "place_as_is" };
  return { kind: "style_reference" };
}

/** 옮길 역할이 없으면 null. 마지막 장은 역할이 아니라 자리다. */
export function fromCardNewsAttachment(kind: CardNewsKind, subject?: Subject): AttachmentRole | null {
  if (kind === "style_reference") return "style";
  if (kind === "place_as_is") return "place_as_is";
  // 대상을 안 적은 옛 자료는 물건으로 본다. 인물로 보면 '인물은 하나만'에
  // 걸려 멀쩡한 첨부가 막힌다.
  if (kind === "keep_identity") return subject === "person" ? "preserve_person" : "preserve_product";
  return null;
}

/* ── 포스터 ───────────────────────────────────────────────── */

type PosterKind = "style_reference" | "preserved";

/**
 * 포스터는 한 장짜리라 '그대로 넣을 장'이 없다 — 그때는 null.
 *
 * 포스터의 어휘 자체는 사람과 물건을 안 가른다. 그래서 대상을 따로 들고 다닌다.
 * 얼굴이 둘이면 모델이 절충해 제3의 인물을 만드는데, 구분이 없으면 그걸 막을
 * 수도 알릴 수도 없다.
 */
export function toPosterImage(role: AttachmentRole): { kind: PosterKind; subject?: Subject } | null {
  if (role === "place_as_is") return null;
  // 포스터의 어휘는 「그림 느낌만」을 따로 못 담는다. 지킬 사람으로 보내고,
  // 그림 느낌을 바꿔도 되는지는 `poster-core` 가 따로 들고 다닌다.
  if (role === "preserve_person" || role === "preserve_person_restyled") {
    return { kind: "preserved", subject: "person" };
  }
  if (role === "preserve_product") return { kind: "preserved", subject: "object" };
  return { kind: "style_reference" };
}

export function fromPosterImage(kind: PosterKind, subject?: Subject): AttachmentRole {
  if (kind === "style_reference") return "style";
  return subject === "person" ? "preserve_person" : "preserve_product";
}

/* ── 상세페이지 ───────────────────────────────────────────── */

type PdpKind = "anchor" | "person" | "style";

export function toPdpReference(role: AttachmentRole): PdpKind | null {
  if (role === "preserve_product") return "anchor";
  // 상세페이지도 아직 모른다(설계 §3 3단계).
  if (role === "preserve_person" || role === "preserve_person_restyled") return "person";
  if (role === "style") return "style";
  return null;
}

export function fromPdpReference(kind: PdpKind): AttachmentRole {
  if (kind === "anchor") return "preserve_product";
  if (kind === "person") return "preserve_person";
  return "style";
}

/* ── 불변식 ───────────────────────────────────────────────── */

/**
 * 인물은 하나만.
 *
 * 얼굴이 둘이면 모델이 절충해 제3의 인물을 만든다
 * (pdp-core/src/pdp.reference-policy.ts). 제품은 여럿이어도 된다.
 */
export function personOverflow(roles: AttachmentRole[]): boolean {
  // 그림 느낌을 바꾸든 안 바꾸든 지킬 얼굴이라는 점은 같다. 함께 센다.
  return roles.filter(
    (role) => role === "preserve_person" || role === "preserve_person_restyled",
  ).length > 1;
}
