# 데모 페이지 — 전사 기반 리디자인 쇼케이스 설계

- 작성일: 2026-07-24
- 대상: `apps/web/app/demo/page.tsx` (공개 `/demo` 페이지), `public/demo-sections/`
- 범위: `/demo`에 "전사 기반 리디자인 예시(세럼 8섹션)" 케이스 추가. 랜딩·기존 4샘플·생성 파이프라인은 불변.

## 배경
`/demo`는 현재 `/samples/1~4.jpg`(뷰티/라이프/푸드/브랜드)를 스크롤 카드로 보여준다. 이번에 전사(transcribe) 기능으로 만든 8섹션 리디자인 결과물을 **차별점(전사)까지 드러나는 케이스**로 추가한다.

## 요구사항 (사용자 확정)
1. 랜딩 유지. `/demo`에 기존 4장 + 신규 케이스.
2. 8섹션을 **위→아래 스크롤(=전체 상세페이지 흐름)**, 각 섹션 라벨 표시.
3. 차별점은 **슬로건/뻔한 문장 금지** → **데이터 칩 + 절제된 사실 한 줄**로만.
4. "예시(데모)" 톤 유지, 새 디자인 시스템 도입 없음(기존 Tailwind + `@fixup/ui` Badge/Card 재사용).

## 설계
`/demo/page.tsx`에 기존 `samples` 그리드와 하단 CTA **사이**에 신규 `<section>` 추가:

- eyebrow: `<Badge>전사 기반 리디자인</Badge>`
- 제목: "데일리 수분 세럼 · 예시"
- **사실 한 줄(확정 문구, 뻔한 슬로건 아님):** "원본 상세페이지의 성분·인증·시험 수치까지 전사해 근거로 삼았습니다."
- **사실 칩(데이터 태그, Badge outline):** `히알루론산 2%` · `나이아신아마이드 2%` · `임상 수분 68%↑` · `무향료·무색소` · `인증 제2024-…호`
- **8섹션 스크롤 프레임**(기존 카드의 `max-h-[...] overflow-y-auto` 패턴 재사용, 중앙 1열 max-w-md): 각 항목 = 작은 라벨 Badge + `<Image>`. 순서·라벨:
  1. 히어로 · 후킹  2. 문제 공감  3. 베네핏  4. USP 차별점  5. 근거 · 신뢰  6. 사용법  7. 후기  8. FAQ · 오퍼

신규 데이터 배열(page.tsx 내부):
```ts
const showcase = {
  facts: ["히알루론산 2%","나이아신아마이드 2%","임상 수분 68%↑","무향료·무색소","인증 제2024-…호"],
  sections: [
    { src:"/demo-sections/01-hero.jpg",   label:"히어로 · 후킹" },
    { src:"/demo-sections/02-problem.jpg", label:"문제 공감" },
    { src:"/demo-sections/03-benefit.jpg", label:"베네핏" },
    { src:"/demo-sections/04-usp.jpg",     label:"USP 차별점" },
    { src:"/demo-sections/05-trust.jpg",   label:"근거 · 신뢰" },
    { src:"/demo-sections/06-howto.jpg",   label:"사용법" },
    { src:"/demo-sections/07-review.jpg",  label:"후기" },
    { src:"/demo-sections/08-faq.jpg",     label:"FAQ · 오퍼" },
  ],
};
```

## 정적 자산
`public/demo-sections/01-hero.jpg` ~ `08-faq.jpg` — 큐레이션한 8장(S4·S6·S7 편집본, S2 최종본 포함)을 **jpg로 최적화**(각 ~768×1344, 품질 ~85, 장당 <300KB 목표). Next `<Image width={768} height={1344}>`.

## 콘텐츠 안전
- 가상 제품·가상 정보 = 레퍼런스(예시)로 명시. 기존 "고정 예시" 톤 유지.
- 뻔한 마케팅 문장·못난 텍스트 금지 — 텍스트는 위 확정 문구/칩만. 추가 카피 없음.

## 배포
`/demo`는 React 페이지라 앱 재빌드 필요 → **EC2 프론트 배포 1회**(build:ec2 → 아티팩트 → Session Manager → deploy-release.sh + node_modules graft, 함정 문서 참조).

## 범위 밖
- 원본↔생성 before/after 토글, 전사문 전체 노출(후속).
- 생성 품질 자동검증(③ 별도 페이즈).
