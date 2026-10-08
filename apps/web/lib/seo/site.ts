import type { Metadata } from "next";

/**
 * **검색 노출(SEO)의 사이트 기본값**(계획 2026-10-06 seo-search-registration).
 *
 * 주소는 빌드 때 박히는 `NEXT_PUBLIC_SITE_URL` 에서 받는다(운영: https://formwith.fix-up.kr).
 * 대표 주소·사이트 지도·공유 정보가 모두 이 값을 쓴다 — 여러 곳에 적으면 하나만 바뀐다.
 */
export const SITE_NAME = "FormWith";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://54.180.68.212").replace(/\/+$/, "");

/** 링크를 붙였을 때 뜨는 그림. 바꿀 때는 파일 이름도 바꾼다(`app/layout.tsx` 주석). */
export const OG_IMAGE = { url: "/og-hero.png", width: 1200, height: 630, alt: "FormWith 가 만든 결과물" } as const;

export type SearchVerificationCodes = { google: string; naver: string; daumPin: string };

/**
 * **검색 서비스 소유 확인 값.** 각 콘솔이 주는 값을 그대로 넣는다(사이트에 공개되는 값이라 비밀이 아니다).
 *
 * - google: 구글 서치 콘솔 → URL 접두어 → HTML 태그의 `content` 값
 * - naver: 네이버 서치어드바이저 → 사이트 등록 → HTML 태그의 `content` 값
 * - daumPin: 다음 웹마스터도구가 준 robots.txt 한 줄 전체(`#DaumWebMasterTool:` 로 시작)
 *
 * 비어 있으면 그 태그·줄을 만들지 않는다. 넣는 법은 `docs/SEO.md`.
 */
export const SEARCH_VERIFICATION: SearchVerificationCodes = {
  google: "PU2RGhUapDAvAYeduNewUKJFQrKLHwO_2lc1n47sm5g",
  naver: "71bcc9f01c1627643f6ea41d7cabef997708066f",
  daumPin: "",
};

export function verificationMetadata(codes: SearchVerificationCodes = SEARCH_VERIFICATION): Metadata["verification"] {
  const google = codes.google.trim();
  const naver = codes.naver.trim();
  if (!google && !naver) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(naver ? { other: { "naver-site-verification": naver } } : {}),
  };
}
