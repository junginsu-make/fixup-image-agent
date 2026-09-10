/**
 * MCS 마크 — 겹쳐 쌓인 사각형 셋.
 *
 * 2026-09-10 에 첫 화면 로고가 바뀌면서 여기도 맞췄다. 원본은
 * `apps/web/public/brand/mcs-mark-{dark,light}-bg.svg` 다.
 *
 * **원본은 배경별로 두 벌인데 여기서는 한 벌로 쓴다.**
 *
 *   어두운 배경용   회색 둘이 `#F2F2F0`
 *   밝은 배경용     회색 둘이 `#08080A`
 *
 * 첫 화면은 항상 어두워서 한 벌을 그냥 박아도 됐다. 이 컴포넌트가 붙는
 * 스튜디오 사이드바와 가입·로그인 화면은 **테마를 따라간다** — 한 벌만 박으면
 * 한쪽 테마에서 배경에 묻혀 안 보인다. 그래서 회색 둘을 `currentColor` 로 두고
 * 글자색을 따라가게 한다. 두 원본이 쓰는 색이 정확히 그 자리의 글자색이라,
 * 결과가 원본과 같아진다.
 *
 * **맨 위 초록(`#6EE7A8`)만 고정이다.** 액센트는 테마를 안 따라간다 —
 * 로고에서 브랜드를 알아보게 하는 자리가 여기 하나뿐이다.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      role="img"
      aria-label="MCS"
    >
      <rect x="2" y="12" width="18" height="18" rx="3" fill="currentColor" fillOpacity="0.35" />
      <rect x="7" y="7" width="18" height="18" rx="3" fill="currentColor" fillOpacity="0.7" />
      <rect x="12" y="2" width="18" height="18" rx="3" fill="#6EE7A8" />
    </svg>
  );
}
