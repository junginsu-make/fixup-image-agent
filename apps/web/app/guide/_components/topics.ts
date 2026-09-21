/**
 * 설명서의 목차 — 단일 출처.
 *
 * 목차·개요 지도·이전다음 이동이 모두 이 목록을 본다. 세 곳에 따로 적으면
 * 페이지를 하나 더할 때 한 곳을 빠뜨린다.
 *
 * ── 사이드바와 같은 차례·같은 이름 ───────────────────────────
 *
 * 2026-09-21 에 사이드바를 갈래로 묶고 이름을 줄였다(이미지 > 쉽게 · 다양하게
 * …). 설명서 목차가 옛 이름 그대로면 **메뉴에서 본 이름을 설명서에서 못 찾는다.**
 * 설명서의 일이 「어디를 누르는지 말해 주는 것」인데 그 이름이 다르면 안 된다.
 *
 * 그래서 목차는 사이드바를 그대로 따른다. **산문은 따르지 않는다** — 「이미지 >
 * 다양하게에서 불러 씁니다」는 읽을 수 없는 글이다. 짧은 이름은 머리말이 뜻의
 * 절반을 질 때만 선다. 산문에서는 지금까지대로 「이미지 만들기」라고 쓰고,
 * 두 이름을 잇는 일은 **목차와 각 문서의 머리말**이 한다.
 */

export interface GuideTopic {
  href: string;
  /**
   * 갈래. 사이드바의 머리말과 같은 말이다.
   *
   * 없는 항목은 갈래에 안 드는 것이다(처음 오셨다면 · 라이브러리 · 팀 · 크레딧).
   */
  section?: string;
  /** 목차에 뜨는 이름 */
  label: string;
  /** 개요 지도에서 한 줄 설명 */
  desc: string;
  /** 실제 도구로 가는 길. 설명만 있는 항목은 없다 */
  toolHref?: string;
  toolLabel?: string;
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    href: "/guide",
    label: "처음 오셨다면",
    desc: "이 시스템이 무엇이고 도구가 어떻게 이어지는지",
  },
  /*
    **차례가 사이드바와 같다.** 처음 온 사람이 메뉴에서 본 순서 그대로 읽는다 —
    「쉽게」가 도구 목록 맨 위에 있으므로 설명서도 맨 앞이다(설계 §2).
  */
  {
    href: "/guide/easy",
    section: "이미지",
    label: "쉽게",
    desc: "말로 만들기. 묻고 답하다가 만들고 싶을 때 만든다",
    toolHref: "/easy",
    toolLabel: "「쉽게」 열기",
  },
  {
    href: "/guide/image",
    section: "이미지",
    label: "다양하게",
    desc: "광고 소재 · 포스터 · 일반 이미지 한 장",
    toolHref: "/poster",
    toolLabel: "「다양하게」 열기",
  },
  {
    href: "/guide/cardnews",
    section: "이미지",
    label: "카드뉴스",
    desc: "여러 장으로 이야기하기. 만드는 길이 둘이다",
    toolHref: "/sns",
    toolLabel: "카드뉴스 열기",
  },
  {
    href: "/guide/character",
    section: "이미지",
    label: "캐릭터",
    desc: "사람 · 동물 · 캐릭터 · 사물을 고정해 재사용",
    toolHref: "/characters",
    toolLabel: "캐릭터 열기",
  },
  {
    href: "/guide/ad",
    section: "이미지",
    label: "광고소재",
    desc: "만든 이미지에서 포털 광고 규격 뽑기",
    toolHref: "/ad",
    toolLabel: "「광고소재」 열기",
  },
  {
    href: "/guide/detail-page",
    section: "상세페이지",
    label: "만들기",
    desc: "상품 사진 한 장 또는 글만으로 상세페이지를",
    toolHref: "/create",
    toolLabel: "상세페이지 만들기 열기",
  },
  {
    href: "/guide/redesign",
    section: "상세페이지",
    label: "리디자인",
    desc: "이미 있는 페이지를 뜯어보고 다시 설계",
    toolHref: "/redesign",
    toolLabel: "리디자인 열기",
  },
  /*
    **꼬리의 셋에도 머리말을 준다.** 안 주면 바로 위 갈래(상세페이지) 아래에
    붙어 보인다 — 라이브러리가 상세페이지의 한 갈래로 읽힌다(2026-09-21 확인).
    「보관」은 사이드바가 쓰는 그 말이고, 「그 밖에」는 사이드바에 머리말이 없는
    자리(팀·계정)를 설명서에서 묶는 말이다.
  */
  {
    href: "/guide/library",
    section: "보관",
    label: "라이브러리",
    desc: "재료를 모아 두고 어느 도구에서든 불러 쓰기",
    toolHref: "/library",
    toolLabel: "라이브러리 열기",
  },
  {
    href: "/guide/team",
    section: "그 밖에",
    label: "팀",
    desc: "재료를 나눠 쓰고 크레딧을 함께 관리하기",
    toolHref: "/team",
    toolLabel: "팀 열기",
  },
  {
    href: "/guide/credits",
    section: "그 밖에",
    label: "크레딧과 모델",
    desc: "무엇이 얼마나 차감되고 모델은 어떻게 고르나",
    toolHref: "/settings",
    toolLabel: "사용량 보기",
  },
];

/**
 * 메뉴에서 부르는 이름. 「이미지 > 다양하게」 꼴이다.
 *
 * 갈래가 없는 항목은 이름만 준다 — 사이드바에서도 머리말 없이 서 있다.
 */
export function menuPathOf(topic: GuideTopic): string {
  return topic.section ? `${topic.section} > ${topic.label}` : topic.label;
}

/** 목차에서 현재 항목의 앞뒤. 페이지 맨 아래 이동에 쓴다. */
export function neighborsOf(href: string): { prev?: GuideTopic; next?: GuideTopic } {
  const index = GUIDE_TOPICS.findIndex((topic) => topic.href === href);
  if (index < 0) return {};
  return {
    prev: index > 0 ? GUIDE_TOPICS[index - 1] : undefined,
    next: index < GUIDE_TOPICS.length - 1 ? GUIDE_TOPICS[index + 1] : undefined,
  };
}
