import type { ShowcaseView } from "../../api/showcase/core";

/**
 * 첫 화면 캐러셀에 걸 그림.
 *
 * **무엇을 걸지는 관리자가 고른다**(`/admin` 의 쇼케이스). 회원이 만든 것을
 * 전부 자동으로 걸면 출시 전 기획물이 만들어지는 즉시 공개 인터넷에 올라간다.
 *
 * 아직 하나도 안 골랐으면 아래 기본값을 보여준다 — 관리자가 손대기 전까지 첫
 * 화면이 텅 비어 있으면 안 된다. 예전 갤러리 섹션이 쓰던 것과 같은 규칙이다.
 */

export interface Slide {
  src: string;
  label: string;
  /** 도구 이름. 접근성 설명에 쓰인다. */
  kind: string;
}

/** 관리자가 아직 아무것도 안 골랐을 때 거는 것. 전부 이 시스템이 만든 결과물이다. */
export const FALLBACK_SLIDES: Slide[] = [
  { src: "/landing/result-winter-trend.png", label: "겨울 트렌드", kind: "상세페이지" },
  { src: "/demo-sections/01-hero.jpg", label: "히어로 컷", kind: "상세페이지" },
  { src: "/landing/result-poster-sports.png", label: "스포츠 포스터", kind: "포스터" },
  { src: "/demo-sections/03-benefit.jpg", label: "혜택 섹션", kind: "상세페이지" },
  { src: "/landing/result-cardnews-lease.png", label: "리스 안내", kind: "카드뉴스" },
  { src: "/demo-sections/05-trust.jpg", label: "신뢰 섹션", kind: "상세페이지" },
  { src: "/samples/1.jpg", label: "샘플 01", kind: "이미지 만들기" },
  { src: "/demo-sections/07-review.jpg", label: "후기 섹션", kind: "상세페이지" },
  { src: "/samples/3.jpg", label: "샘플 03", kind: "이미지 만들기" },
  { src: "/demo-sections/mood-a.jpg", label: "무드 A", kind: "레퍼런스" },
  { src: "/samples/4.jpg", label: "샘플 04", kind: "이미지 만들기" },
  { src: "/demo-sections/04-usp.jpg", label: "차별점 섹션", kind: "상세페이지" },
];

/**
 * 캐러셀 한 바퀴가 너무 짧으면 같은 그림이 금세 다시 온다.
 *
 * 관리자가 두세 장만 골라 둔 날에도 화면이 허전하지 않도록, 모자라면 기본값을
 * 뒤에 덧대 이만큼은 채운다.
 */
export const MIN_SLIDES = 6;

/**
 * 관리자가 고른 것을 캐러셀이 쓸 모양으로 바꾼다.
 *
 * **작은 사본(`thumbUrl`)을 쓴다.** 첫 화면이 원본 열두 장을 받아 오면 느리다.
 * 캐러셀에서 판 하나는 화면의 절반도 안 되므로 사본으로 충분하다.
 */
export function slidesFromShowcase(items: ShowcaseView[]): Slide[] {
  const picked: Slide[] = items.map((item) => ({
    src: item.thumbUrl,
    label: item.caption?.trim() || "결과물",
    kind: item.kindLabel?.trim() || "이 시스템이 만든 것",
  }));

  if (!picked.length) return FALLBACK_SLIDES;
  if (picked.length >= MIN_SLIDES) return picked;

  // 고른 것을 앞에 두고 모자란 만큼만 기본값으로 채운다.
  return [...picked, ...FALLBACK_SLIDES.slice(0, MIN_SLIDES - picked.length)];
}
