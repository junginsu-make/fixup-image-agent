/**
 * 카드뉴스 01 에서 「웹 주소」로 내용을 가져오는 기능의 스위치.
 *
 * 2026-09-22 에 끈다. 운영에서 작동하지 않았고, 원인은 서버 기록에 안 남아 확정하지
 * 못했다 — 설계(`docs/superpowers/specs/2026-09-22-account-cardnews-team-review.md` §1.2)가
 * 가장 유력하게 본 것은 jsdom 번들링 실패다. 고치고 나서 `SNS_WEB_SOURCE=1` 로 켠다.
 *
 * `isAdExportEnabled` 와 같은 모양이다 — **켜는 것이 명시적이어야 한다.** 오타나 빈
 * 값으로 켜지면 스위치가 아니다. import 가 없는 잎 모듈이라 화면·API 어디서 읽어도 싸다.
 */
export function isWebSourceEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.SNS_WEB_SOURCE === "1";
}
