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
  // **카드뉴스는 `restyle` 을 따로 들고 다닌다.** 카드뉴스 어휘에는 담을 칸이
  // 없어서 여기서는 둘을 같은 kind 로 보내고, 화면(`attachment-picker` 의
  // `roleOf`)과 프롬프트(`image-prompt`)가 `restyle` 플래그로 가른다.
  // `fromCardNewsAttachment` 로는 이 역할을 못 돌려주므로 화면이 앞질러 읽는다 —
  // 그 앞지르기를 지우면 넷째 역할이 화면에서 사라진다.
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

/** 지킬 얼굴 한 장이 어디서 왔나. 캐릭터에서 왔으면 그 캐릭터의 id. */
export interface PersonEntry {
  role: AttachmentRole;
  /**
   * 어느 캐릭터의 각도인가.
   *
   * 캐릭터 하나는 정면·측면·뒷모습이 **한 벌**이다. 그 넷을 붙이면 장은 넷이지만
   * 사람은 하나다. 이 값이 없으면 낱장으로 올린 사진이라 각각을 한 사람으로 센다.
   */
  characterId?: string | null;
}

/** 지킬 얼굴인가. 그림 느낌을 바꾸든 안 바꾸든 지킬 얼굴이라는 점은 같다. */
function isPerson(role: AttachmentRole): boolean {
  return role === "preserve_person" || role === "preserve_person_restyled";
}

/**
 * 지킬 **사람이 몇 명인가.** 장이 몇 장인가가 아니다.
 *
 * 같은 캐릭터의 여러 각도는 한 명으로 센다. 장으로 세면 캐릭터를 만든 뜻이
 * 사라진다 — 각도를 쓰려고 넷을 만들어 놓고 붙이는 순간 「인물이 넷」으로
 * 막히기 때문이다(2026-09-15 사용자 보고).
 */
export function countPreservedPeople(entries: PersonEntry[]): number {
  const characters = new Set<string>();
  let loose = 0;

  for (const entry of entries) {
    if (!isPerson(entry.role)) continue;
    if (entry.characterId) characters.add(entry.characterId);
    else loose += 1;
  }

  return characters.size + loose;
}

/**
 * 인물은 하나만.
 *
 * 얼굴이 **서로 다른 사람으로** 둘이면 모델이 절충해 제3의 인물을 만든다
 * (pdp-core/src/pdp.reference-policy.ts). 제품은 여럿이어도 된다.
 *
 * 같은 캐릭터의 여러 각도는 걸리지 않는다 — 그건 한 사람이다.
 */
export function personOverflow(entries: Array<AttachmentRole | PersonEntry>): boolean {
  return (
    countPreservedPeople(
      entries.map((entry) => (typeof entry === "string" ? { role: entry } : entry)),
    ) > 1
  );
}

/**
 * 같은 인물의 여러 각도를 붙였을 때 **그림 모델에게 할 말.**
 *
 * 여러 장을 그냥 주면 모델은 서로 다른 사람으로 읽거나, 각도와 장면까지
 * 그대로 베낀다. 다섯 도구가 같은 문장을 써야 도구를 옮겨도 같은 결과가 난다.
 */
export function characterAngleDirective(count: number): string {
  return (
    `Images of this person (${count} of them) are the SAME character seen from different angles. ` +
    "They are identity references, not scenes to copy: use them together to keep one consistent " +
    "face, body and hair. Do NOT reproduce their poses, camera angles, framing, clothing or " +
    "backgrounds — compose the scene this card asks for. Generate exactly one person."
  );
}
