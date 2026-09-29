/**
 * 결과 화면에서 광고 내보내기로 가는 주소.
 *
 * 설계: `2026-09-08-ad-portal-first-selection.md` §1 ①
 *
 * **import 가 한 줄도 없는 잎 모듈이다.** `export-rules.ts` 에 두면 결과 화면이
 * 그것을 들이고, 그 파일은 `AD_SPECS`(249줄)와 `derive` 를 끌고 온다 —
 * **광고와 상관없는 포스터 사용자 전부의 번들**에 실린다. 규격 고르는 칸을
 * 별도 파일로 뺀 이유가 바로 그것이었다(`ad-spec-picker.tsx` 머리말).
 *
 * `feature.ts` 가 스위치 하나 때문에 잎 모듈이 된 것과 같은 판단이다.
 *
 * **그림 id 를 싣는다**(2026-09-29). 전에는 변형 번호(`position`)를 실었는데,
 * 번호는 회차마다 0 부터라 「고친 결과 1」 밑의 단추가 변형 1 을 골랐다. 광고
 * 화면은 옛 주소의 `position` 도 계속 받는다(`preferredPosition`).
 */
export function adExportHref(projectId: string, imageId: string): string {
  const query = new URLSearchParams({
    source: "poster",
    id: projectId,
    image: imageId,
  });
  return `/ad?${query.toString()}`;
}
