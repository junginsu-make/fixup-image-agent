/**
 * 광고 기능을 통째로 끄는 스위치 (설계 §4.1 계약 5).
 *
 * `isLocalStoreEnabled` 와 같은 모양이다 — **켜는 것이 명시적이어야 한다.**
 * 오타나 빈 값으로 켜지면 스위치가 아니다.
 *
 * **import 가 한 줄도 없는 잎 모듈이다.** 초판은 이것이 `batch.ts` 에 있었고,
 * `poster-service.ts` 가 스위치 하나를 읽으려고 `batch → export/check → sharp`
 * 를 통째로 끌고 왔다. 포스터 만들기 라우트가 **광고 파생 엔진과 네이티브
 * sharp 바인딩을 로드**하는 상태였다 — 설계가 깨기로 목록에 올린 것이 아니다.
 */
export function isAdExportEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.AD_EXPORT === "1";
}
