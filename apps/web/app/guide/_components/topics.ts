/**
 * 설명서의 목차 — 단일 출처.
 *
 * 목차·개요 지도·이전다음 이동이 모두 이 목록을 본다. 세 곳에 따로 적으면
 * 페이지를 하나 더할 때 한 곳을 빠뜨린다.
 */

export interface GuideTopic {
  href: string;
  /** 목차에 뜨는 이름 */
  label: string;
  /** 개요 지도에서 한 줄 설명 */
  desc: string;
  /** 실제 도구로 가는 길. 설명만 있는 항목은 없다 */
  toolHref?: string;
  toolLabel?: string;
  /**
   * 관리자에게만 보이는 항목.
   *
   * **감추는 것은 안내일 뿐이다.** 실제 차단은 등록부(`lib/access/routes.ts`)를
   * 보는 미들웨어가 한다 — 여기 한 줄을 빠뜨려도 주소를 치면 안 열린다.
   * 다만 눌러서 막히는 메뉴를 만들지 않으려고 목록에서도 뺀다.
   */
  adminOnly?: true;
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    href: "/guide",
    label: "처음 오셨다면",
    desc: "이 시스템이 무엇이고 도구가 어떻게 이어지는지",
  },
  {
    href: "/guide/cardnews",
    label: "카드뉴스 만들기",
    desc: "여러 장으로 이야기하기. 만드는 길이 둘이다",
    toolHref: "/sns",
    toolLabel: "카드뉴스 열기",
  },
  {
    href: "/guide/image",
    label: "이미지 만들기",
    desc: "광고 소재 · 포스터 · 일반 이미지 한 장",
    toolHref: "/poster",
    toolLabel: "이미지 만들기 열기",
  },
  {
    href: "/guide/detail-page",
    label: "상세페이지 만들기",
    desc: "상품 사진 한 장 또는 글만으로 상세페이지를",
    toolHref: "/create",
    toolLabel: "상세페이지 만들기 열기",
  },
  {
    href: "/guide/redesign",
    label: "상세페이지 리디자인",
    desc: "이미 있는 페이지를 뜯어보고 다시 설계",
    toolHref: "/redesign",
    toolLabel: "리디자인 열기",
  },
  {
    href: "/guide/character",
    label: "캐릭터 만들기",
    desc: "사람 · 동물 · 캐릭터 · 사물을 고정해 재사용",
    toolHref: "/characters",
    toolLabel: "캐릭터 열기",
  },
  {
    href: "/guide/ad",
    label: "광고 규격으로 내보내기",
    desc: "만든 그림에서 포털 광고 규격 뽑기",
    toolHref: "/ad",
    toolLabel: "광고 규격으로 내보내기 열기",
  },
  {
    href: "/guide/library",
    label: "라이브러리",
    desc: "재료를 모아 두고 어느 도구에서든 불러 쓰기",
    toolHref: "/library",
    toolLabel: "라이브러리 열기",
  },
  {
    href: "/guide/team",
    label: "팀",
    desc: "재료를 나눠 쓰고 크레딧을 함께 관리하기",
    toolHref: "/team",
    toolLabel: "팀 열기",
  },
  {
    href: "/guide/credits",
    label: "크레딧과 모델",
    desc: "무엇이 얼마나 차감되고 모델은 어떻게 고르나",
    toolHref: "/settings",
    toolLabel: "사용량 보기",
    adminOnly: true,
  },
];

/**
 * 이 사람에게 보일 목차.
 *
 * 목차·개요 지도·앞뒤 이동이 모두 이것을 본다. 한 곳이라도 거르지 않으면
 * **눌러서 막히는 메뉴**가 생긴다 — 등록부 머리말이 경계하는 그것이다.
 */
export function guideTopicsFor(isAdmin: boolean): GuideTopic[] {
  return isAdmin ? GUIDE_TOPICS : GUIDE_TOPICS.filter((topic) => !topic.adminOnly);
}

/**
 * 목차에서 현재 항목의 앞뒤. 페이지 맨 아래 이동에 쓴다.
 *
 * **보이는 목록에서 찾는다.** 회원에게 안 보이는 장을 「다음」으로 걸면 눌러서
 * 막히는 자리가 된다.
 */
export function neighborsOf(href: string, isAdmin = true): { prev?: GuideTopic; next?: GuideTopic } {
  const topics = guideTopicsFor(isAdmin);
  const index = topics.findIndex((topic) => topic.href === href);
  if (index < 0) return {};
  return {
    prev: index > 0 ? topics[index - 1] : undefined,
    next: index < topics.length - 1 ? topics[index + 1] : undefined,
  };
}
