/**
 * 「아이디어 발굴」 창에 띄우는 바깥 사이트.
 *
 * 우리는 **안내만** 한다. 그림을 가져오거나 붙여 넣지 않는다 — 저작권은
 * 각 사이트의 이용 조건을 따른다. 그래서 창 안내 문구도 「분위기·구성만
 * 참고하고, 쓸 그림은 사이트 라이선스를 확인하라」로 둔다.
 *
 * 묶음은 쓰임새로 나눴다. 보기만 하는 곳, 내려받아 쓸 수 있는 곳(라이선스
 * 확인 필요), 템플릿으로 직접 만드는 곳.
 */
export type IdeaSite = {
  readonly name: string;
  readonly url: string;
  /** 무엇을 하러 가는 곳인지 한 줄. */
  readonly note: string;
};

export type IdeaSiteGroup = {
  readonly title: string;
  readonly sites: readonly IdeaSite[];
};

export const IDEA_SITE_GROUPS: readonly IdeaSiteGroup[] = [
  {
    title: "영감 찾기 · 보기만",
    sites: [
      { name: "핀터레스트", url: "https://kr.pinterest.com/", note: "키워드로 분위기·색감 모아 보기" },
      { name: "비핸스", url: "https://www.behance.net/", note: "어도비가 운영하는 디자이너 포트폴리오" },
      { name: "드리블", url: "https://dribbble.com/", note: "디자이너들이 올리는 작업 조각" },
      { name: "메타 광고 라이브러리", url: "https://www.facebook.com/ads/library/", note: "지금 집행 중인 페이스북·인스타 광고" },
    ],
  },
  {
    title: "무료 사진·소스 · 라이선스 확인",
    sites: [
      { name: "픽사베이", url: "https://pixabay.com/ko/", note: "무료 사진·일러스트·벡터" },
      { name: "언스플래시", url: "https://unsplash.com/", note: "고화질 무료 사진" },
      { name: "펙셀스", url: "https://www.pexels.com/ko-kr/", note: "무료 사진·영상" },
    ],
  },
  {
    title: "템플릿으로 만들기",
    sites: [
      { name: "망고보드", url: "https://www.mangoboard.net/", note: "카드뉴스·상세페이지 템플릿" },
      { name: "미리캔버스", url: "https://www.miricanvas.com/", note: "배너·SNS 템플릿" },
      { name: "캔바", url: "https://www.canva.com/ko_kr/", note: "전 세계에서 쓰는 템플릿 도구" },
    ],
  },
];
