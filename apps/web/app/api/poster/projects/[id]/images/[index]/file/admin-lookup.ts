/**
 * 관리자 조회(`adminAssetPath`)를 쓸 것인가.
 *
 * **로컬에서는 쓰면 안 된다.** 그 조회는 Supabase 를 직접 읽는데, 로컬 개발은
 * `LOCAL_STORE=1` 로 파일 시스템을 쓰고 Supabase 환경변수를 **비워 둔다.**
 * 그런데 `lib/dev-auth.ts:44` 가 로컬 사용자를 언제나 `role: "admin"` 으로
 * 주므로, **로컬에서는 이 라우트가 항상 관리자 갈래를 타고 500 을 냈다** —
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
export function usesAdminLookup(role: string, localStore: boolean): boolean {
  return role === "admin" && !localStore;
}
