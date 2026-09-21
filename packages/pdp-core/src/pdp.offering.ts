/**
 * **무엇을 파는가, 무엇을 하러 왔는가.**
 *
 * ── 무엇이 문제였나 (K-08) ───────────────────────────────────
 *
 * 글 입력 경로의 프롬프트가 이렇게 못 박혀 있었다.
 *
 * - 「너는 **무형 상품**(강의·코칭·구독·소프트웨어·커뮤니티)의 판매 기획자다」
 * - 「**무형 상품이다.** 만질 수 있는 제품 사진을 전제하지 마라.」
 *
 * 그리고 모델이 고르던 `offeringKind` 의 값도 **전부 무형**이었다. 실물을
 * 파는데 사진이 없어서 글로 설명한 사람은, 「만질 수 있는 제품을 전제하지
 * 마라」는 지시를 받은 기획을 돌려받는다 — 제품 사진 자리에 은유가 들어간다.
 *
 * ── 축이 둘인데 하나로 붙어 있었다 ──────────────────────────
 *
 * 설계 §9.1: 「이미지/텍스트는 **입력 방식**이다. 실물/서비스/디지털/기타와
 * 판매/문의/홍보 목적은 **별도로 받는다.**」
 *
 * 사진으로 시작하느냐 글로 시작하느냐는 **입력 방식**이고, 파는 것이 만질 수
 * 있느냐는 **상품 종류**다. 둘을 붙여 두면 「사진이 없다 = 무형이다」가 된다.
 */

/** 파는 것이 무엇인가. **사용자가 고른다** — 모델이 글에서 짐작하지 않는다. */
export const PRODUCT_KINDS = ["physical", "service", "digital", "other"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

/**
 * 안 고르면 **모름**이다.
 *
 * 그동안의 기본값은 사실상 「무형」이었고 그것이 이 결함의 뿌리다. 어느 쪽으로
 * 단정해도 절반은 틀리므로, 모를 때는 모른다고 두고 프롬프트가 단정하지 않는다.
 */
export const DEFAULT_PRODUCT_KIND: ProductKind = "other";

/** 이 페이지로 무엇을 하려는가. */
export const PAGE_GOALS = ["purchase", "inquiry", "promotion"] as const;
export type PageGoal = (typeof PAGE_GOALS)[number];

/** 상세페이지는 파는 것이 보통이다. */
export const DEFAULT_PAGE_GOAL: PageGoal = "purchase";

/** 만질 수 있는가. 제품 사진을 전제해도 되는지가 여기서 갈린다. */
export function isTangibleKind(kind: ProductKind): boolean {
  return kind === "physical";
}

const KIND_LABEL: Record<ProductKind, string> = {
  physical: "실물 상품",
  service: "서비스",
  digital: "디지털 상품",
  other: "기타",
};

/** 화면이 쓰는 이름. 서버 문구와 같은 표에서 나온다. */
export function productKindLabel(kind: ProductKind): string {
  return KIND_LABEL[kind];
}

/**
 * 상품 종류가 기획에 주는 규칙.
 *
 * **고정 문장을 이것으로 대신한다.** 전에는 종류와 무관하게 「무형 상품이다」가
 * 늘 실렸다.
 */
export function productKindRule(kind: ProductKind): string {
  if (kind === "physical") {
    return `- 실물 상품이다. 제품을 직접 보여 주는 장면을 써도 된다.
  다만 **사진이 없으므로** 실제 제품의 색·로고·글자를 지어내지 마라.
  형태가 확실하지 않은 부분은 가까이 보여 주지 말고 사용 장면으로 돌려라.`;
  }
  if (kind === "service" || kind === "digital") {
    return `- 만질 수 있는 물건이 아니다. 제품 사진을 전제하지 마라.
  이미지 방향은 사용 장면·결과 장면·감정·은유로 잡는다.`;
  }
  /*
    **모를 때는 단정하지 않는다.** 실물이라고도 무형이라고도 안 한다 —
    어느 쪽으로 밀어도 절반은 틀리고, 틀린 쪽은 페이지 전체가 어긋난다.
  */
  return `- 파는 것이 실물인지 아닌지 사용자가 밝히지 않았다.
  **사용자가 쓴 말에서 읽히는 대로** 잡고, 안 읽히면 사용 장면·결과 장면으로 돌려라.
  실제 제품의 색·로고·글자를 지어내지 마라.`;
}

/**
 * 목적이 기획에 주는 규칙.
 *
 * 상세페이지라고 다 파는 것은 아니다. 문의를 받으려는 페이지에 「지금 구매」를
 * 깔면 읽는 사람이 할 일을 못 찾는다.
 */
export function pageGoalRule(goal: PageGoal): string {
  if (goal === "inquiry") {
    return `- 이 페이지의 목적은 **문의를 받는 것**이다. 마지막에 묻고 싶어지게 만든다.
  값을 모르는 상태로 결제를 재촉하지 마라.`;
  }
  if (goal === "promotion") {
    return `- 이 페이지의 목적은 **알리는 것**이다. 무엇인지 알고 기억하게 만든다.
  파는 말을 앞세우지 말고, 기억에 남는 한 가지를 분명히 한다.`;
  }
  return `- 이 페이지의 목적은 **구매**다. 읽고 나서 살지 말지 정할 수 있게 만든다.`;
}
