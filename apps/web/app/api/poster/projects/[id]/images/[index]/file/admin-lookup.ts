/**
 * 전체 조회(`adminAssetPath`)를 쓸 것인가.
 *
 * **누가 전체를 보는가는 여기서 안 정한다** — `lib/access/core.ts` 의
 * `hasFullScope` 가 정하고, 그 답을 `fullScope` 로 받는다. 목록과 상세가 다른
 * 곳에서 판단하면 「목록에는 뜨는데 안 열리는」 상태가 난다(2026-09-04).
 *
 * 이 함수가 더하는 것은 **로컬 예외 하나**뿐이다.
 *
 * **로컬에서는 쓰면 안 된다.** 그 조회는 Supabase 를 직접 읽는데, 로컬 개발은
 * `LOCAL_STORE=1` 로 파일 시스템을 쓰고 Supabase 환경변수를 **비워 둔다.**
 * 그런데 `lib/dev-auth.ts:44` 가 로컬 사용자를 언제나 `role: "admin"` 으로
 * 주므로, **로컬에서는 이 라우트가 항상 전체 조회 갈래를 타고 500 을 냈다** —
 * 포스터 결과 그림이 한 장도 안 보였다.
 *
 * 광고 규격 화면이 이 주소로 미리보기를 그리는데(설계 §10 3-e), 「사람 눈이
 * 의도 검증이다」(§5.2)가 그 화면의 존재 이유다. 그림이 안 보이면 그 보증이
 * 통째로 없다. 실제로 브라우저에서 눌러 보고 알았다.
 *
 * **운영에는 영향이 없다** — `isLocalStoreEnabled()` 가 거기서는 언제나 거짓이라
 * 관리자 갈래가 그대로 유지된다. 로컬은 사용자가 하나뿐이라 「남의 것을 본다」가
 * 성립하지도 않는다.
 */
export function usesAdminLookup(fullScope: boolean, localStore: boolean): boolean {
  return fullScope && !localStore;
}
