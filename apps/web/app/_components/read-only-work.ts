/**
 * 남의 작업을 **보는 중**일 때 쓰는 요청을 막는다.
 *
 * 관리자는 라이브러리에서 남의 작업을 열어 과정을 볼 수 있다
 * (`api/admin/works/[kind]/[id]`). 다만 **고치지는 못한다** — 고치고 싶으면
 * 자기 것으로 복사한다(2026-09-16 사용자 결정).
 *
 * 단추를 하나씩 `disabled` 로 잠그지 않는 이유는 **빠뜨린 단추가 곧 구멍**이기
 * 때문이다. 화면은 크고(포스터 상세만 682줄) 단추는 계속 늘어난다. 요청이
 * 나가는 길목 하나를 막으면 새 단추가 생겨도 저절로 막힌다.
 *
 * 서버의 쓰기 경로는 손대지 않았으므로 이 막이 뚫려도 남의 DB 는 안 바뀐다.
 * 다만 **크레딧은 요청이 나간 시점에 이미 나간다** — 그래서 화면에서도 막는다.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 규칙이라 시험에서 값으로 잰다.
 */

/** 막혔을 때 사용자에게 보일 말. 무엇을 하면 되는지까지 적는다. */
export const READ_ONLY_MESSAGE =
  "남의 작업은 고칠 수 없습니다. 「내 작업으로 복사」를 누르면 고칠 수 있습니다.";

/**
 * 이 요청을 막아야 하나.
 *
 * **모르는 method 는 막는 쪽으로 틀린다.** 새 method 가 생겼을 때 통과시키는
 * 쪽으로 틀리면 그게 사고다.
 */
export function blockedByReadOnly(readOnly: boolean, init?: RequestInit): boolean {
  if (!readOnly) return false;
  const method = (init?.method ?? "GET").toUpperCase();
  return method !== "GET" && method !== "HEAD";
}
