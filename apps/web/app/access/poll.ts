/**
 * 대기 화면이 스스로 상태를 다시 묻는 규칙.
 *
 * 이 화면에는 **다음 걸음이 저절로 오지 않았다.** 이메일 인증을 마쳐도 사용자가
 * 직접 「상태 새로고침」을 눌러야 했고, 그런 단추가 있는 줄 모르면 하염없이
 * 기다린다. 실제로 그렇게 멈췄다(2026-09-14).
 *
 * 판단만 여기 둔다 — 이 저장소에는 jsdom 이 없어 화면을 그려 볼 수 없다.
 */

/** 한 번 묻고 다음까지 기다리는 시간. */
export const ACCESS_POLL_MS = 3000;

/**
 * 몇 번까지 묻나.
 *
 * 3초에 40번이면 2분이다. 그 안에 안 풀리는 것은 **기다려서 풀릴 일이
 * 아니다** — 관리자 승인이 필요하거나 메일 링크를 아직 안 눌렀다. 계속
 * 두드려 봐야 서버만 먹고, 사용자에게는 곧 될 것처럼 보여 더 오래 붙잡는다.
 */
export const ACCESS_POLL_LIMIT = 40;

/**
 * 지금 다시 물어볼 때인가.
 *
 * 정지된 계정은 묻지 않는다. 기다려도 스스로 풀리지 않는다.
 */
export function shouldPollAccess(options: {
  suspended: boolean;
  tries: number;
}): boolean {
  if (options.suspended) return false;
  return options.tries < ACCESS_POLL_LIMIT;
}

/**
 * 다 묻고도 안 풀렸을 때 할 말.
 *
 * **왜 멈췄는지 말한다.** 아무 말 없이 조용해지면 사용자는 고장으로 읽는다.
 */
export function pollExhaustedNotice(unconfirmed: boolean): string {
  return unconfirmed
    ? "아직 인증이 확인되지 않았습니다. 메일함의 링크를 눌렀는지 확인해 주세요."
    : "아직 준비되지 않았습니다. 운영자 승인을 기다리는 중일 수 있습니다.";
}
