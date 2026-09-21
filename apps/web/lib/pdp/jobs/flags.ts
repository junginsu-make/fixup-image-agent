/**
 * 작업 경로를 켰는가.
 *
 * **기본은 꺼짐이다**(설계 §15). 표가 없거나 워커가 안 떠 있는 상태에서 켜지면
 * 사용자는 만들기를 아예 못 한다. 운영에 표와 실행기가 모두 준비된 것을 확인한
 * 뒤에 켠다.
 *
 * ── 왜 따로 둔 파일인가 ────────────────────────────────────
 *
 * 이 한 줄을 읽으려고 `index.ts` 를 들이면 **저장소 구현 두 벌과 로컬 저장
 * 모듈까지 함께 실린다**(1,100줄 남짓). `membership/api.ts` 는 라우트 오십여
 * 곳이 들이는 파일이라 그 무게가 그대로 번진다.
 *
 * `process.env` 한 칸만 보는 잎 모듈로 둔다. `index.ts` 가 다시 내보내므로
 * 부르던 쪽은 그대로 두어도 된다.
 */
export function isPdpJobsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.PDP_JOBS_ENABLED === "1";
}
