/**
 * **검색 결과에 보일 화면별 제목·설명**(계획 2026-10-06 seo-search-registration).
 *
 * 설명은 화면마다 하나, 40~160자, 실제 기능과 맞는 말만 쓴다(시험이 본다). 설명서 제목은 각 화면에
 * 원래 있던 글자 그대로다 — 검색용으로 따로 바꾸면 화면 머리와 결과 제목이 어긋난다.
 * 핵심 단어는 사용자가 2026-10-06 에 정했다.
 */
export const KEYWORDS = [
  "AI 카드뉴스 만들기",
  "상세페이지 제작",
  "광고 소재 만들기",
  "AI 포스터",
  "마케팅 콘텐츠 제작",
  "AI 이미지 생성",
  "상세페이지 리디자인",
  "캐릭터 만들기",
] as const;

export interface PageCopy {
  title: string;
  description: string;
}

export const HOME_COPY: Record<"ko" | "en", PageCopy> = {
  ko: {
    // 사용자가 정한 문구(2026-10-07). 한글 이름 「폼위드」로도 찾게 한다. 제목은 네이버 기준 40자 이내.
    title: "FormWith 폼위드 AI이미지·카드뉴스·상세페이지·포스터·광고 만들기",
    description:
      "폼위드. 레퍼런스 한 장으로 카드뉴스, 상세페이지, 광고 소재, 포스터, 캐릭터를 만드는 AI 마케팅 콘텐츠 제작 스튜디오 FormWith.",
  },
  en: {
    title: "FormWith | AI marketing content studio",
    description:
      "Give one reference and get images in the same style. Make card news, product detail pages, ad creatives, posters and characters with AI in one studio.",
  },
};

export const GUIDE_COPY: Readonly<Record<string, PageCopy>> = {
  "/guide": {
    title: "사용 설명서",
    description:
      "FormWith 사용 설명서. AI로 카드뉴스, 이미지, 상세페이지, 캐릭터를 만드는 도구와 쓰는 순서를 처음부터 안내합니다.",
  },
  "/guide/easy": {
    title: "쉽게 · 사용 설명서",
    description:
      "「쉽게」 사용법. 만들고 싶은 장면을 말로 묻고 답하다가, 원할 때 AI가 마케팅 이미지를 만들어 주는 방법을 안내합니다.",
  },
  "/guide/image": {
    title: "이미지 만들기 · 사용 설명서",
    description:
      "AI 이미지 만들기 사용법. 광고 소재, 포스터, 일반 이미지 한 장을 레퍼런스와 같은 분위기로 만드는 순서를 안내합니다.",
  },
  "/guide/cardnews": {
    title: "카드뉴스 만들기 · 사용 설명서",
    description:
      "AI 카드뉴스 만들기 사용법. 주제나 글을 넣으면 기획과 원고를 정리하고, 여러 장의 카드뉴스 이미지를 만드는 두 가지 방법을 안내합니다.",
  },
  "/guide/character": {
    title: "캐릭터 만들기 · 사용 설명서",
    description:
      "AI 캐릭터 만들기 사용법. 사람, 동물, 캐릭터, 사물의 모습을 고정해 두고 여러 이미지에서 같은 모습으로 다시 쓰는 방법을 안내합니다.",
  },
  "/guide/ad": {
    title: "광고 규격으로 내보내기 · 사용 설명서",
    description:
      "만든 이미지를 포털 광고 규격 크기로 한 번에 내보내는 방법. 비율 맞춤, 안전영역 표시, 내보낸 파일 검사를 안내합니다.",
  },
  "/guide/detail-page": {
    title: "상세페이지 만들기 · 사용 설명서",
    description:
      "AI 상세페이지 제작 사용법. 상품 사진 한 장 또는 글만으로 쇼핑몰 상세페이지를 기획하고 이미지로 만드는 순서를 안내합니다.",
  },
  "/guide/redesign": {
    title: "상세페이지 리디자인 · 사용 설명서",
    description:
      "상세페이지 리디자인 사용법. 이미 있는 상세페이지를 AI가 뜯어보고 구성과 디자인을 새로 설계하는 방법을 안내합니다.",
  },
  "/guide/library": {
    title: "라이브러리 · 사용 설명서",
    description:
      "라이브러리 사용법. 레퍼런스와 재료 이미지를 모아 두고 카드뉴스, 이미지, 상세페이지 어느 도구에서든 불러 쓰는 방법을 안내합니다.",
  },
  "/guide/team": {
    title: "팀 · 사용 설명서",
    description:
      "팀 사용법. 팀원과 재료를 나눠 쓰고 크레딧을 함께 관리하는 방법을 안내합니다. 지금은 팀 기능을 잠시 꺼 두었습니다.",
  },
  "/guide/credits": {
    title: "크레딧과 모델 · 사용 설명서",
    description:
      "크레딧과 생성 모델 안내. 기능마다 크레딧이 얼마나 차감되는지와 이미지 생성 방식을 고르는 기준을 정리했습니다.",
  },
  "/guide/account": {
    title: "계정과 플랜 · 사용 설명서",
    description:
      "계정과 플랜 안내. 내 정보 확인, 구독과 해지, 환불 신청, 회원 탈퇴 방법을 한 곳에 정리했습니다.",
  },
  "/guide/trouble": {
    title: "막혔을 때 · 사용 설명서",
    description:
      "FormWith를 쓰다 막혔을 때 보는 안내. 화면에 나온 안내 문구가 무슨 뜻이고 어떻게 하면 되는지 정리했습니다.",
  },
};
