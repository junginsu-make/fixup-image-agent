import { randomId } from "./browser-safe";

/**
 * 크레딧이 깎이는 요청을 보낸다.
 *
 * 서버는 이런 요청마다 `x-idempotency-key` 를 요구한다. 같은 요청이 두 번
 * 들어와도 크레딧을 한 번만 깎으려는 열쇠라, 없으면 예약 자체를 거절한다
 * (`membership/api.ts`).
 *
 * **손으로 붙이면 언젠가 빠진다.** 실제로 캐릭터 화면이 생 `fetch` 를 쓰면서
 * 이 헤더를 빠뜨려, 만들기가 통째로 400 으로 막혔다(2026-09-04). 로컬에서는
 * 인증 우회가 헤더 검사보다 먼저 지나가 안 드러났고 운영에서만 났다.
 *
 * 그래서 붙이는 자리를 하나로 모은다. 이 함수를 쓰면 잊을 수 없다.
 */
export async function billableFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("content-type", "application/json");
  headers.set("x-generation-protocol", "2");
  // 이미 넣어 준 것이 있으면 존중한다 — 재시도에서 같은 열쇠를 쓸 수 있어야
  // 두 번 깎이지 않는다.
  if (!headers.has("x-idempotency-key")) headers.set("x-idempotency-key", randomId());
  return fetch(path, { ...init, method: init?.method ?? "POST", headers });
}

/** 보낼 헤더만 만든다. 이미 `fetch` 를 쓰고 있는 자리에서 쓴다. */
export function billableHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra ?? {});
  headers.set("content-type", "application/json");
  headers.set("x-generation-protocol", "2");
  if (!headers.has("x-idempotency-key")) headers.set("x-idempotency-key", randomId());
  return headers;
}
