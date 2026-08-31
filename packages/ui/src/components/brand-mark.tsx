/**
 * PDP STUDIO 마크 — AI 가 쌓는 상세페이지 섹션 스택.
 *
 * 마지막 한 칸이 구매전환(CTA) 섹션이라 액센트 컬러(버밀리언)다.
 * 브랜드 규칙상 **이 액센트 바는 다른 색으로 바꾸지 않는다.**
 *
 * 타일은 항상 어두운 색이다. 라이트 모드에서도 그대로 둔다 — 로고는
 * 화면 테마를 따라가는 요소가 아니라 고정된 표식이다.
 *
 * 원본: frontend/PDP 스튜디오 로고 제안/brand/svg/mark-dark-tile.svg
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 88 88"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="PDP STUDIO"
    >
      <rect width="88" height="88" rx="22" fill="#141418" />
      <rect x="20" y="17.5" width="48" height="8" rx="2" fill="#F4F3F1" />
      <rect x="20" y="32.5" width="33.6" height="8" rx="2" fill="#8B8781" />
      <rect x="20" y="47.5" width="40.8" height="8" rx="2" fill="#8B8781" />
      <rect x="20" y="62.5" width="48" height="8" rx="2" fill="#E8622E" />
    </svg>
  );
}
