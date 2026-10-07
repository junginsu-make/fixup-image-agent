/**
 * **값이 나가기 전에 멈춘다**(설계 §2-3 ⓪ · §2-6 ⓒ).
 *
 * 다시 눌러도 같은 곳에서 막히므로 `retryable: false` 다 — 화면이 「다시 보내면
 * 값이 또 듭니다」를 띄우지 않는다. 실제로 아무 값도 안 나갔다.
 *
 * 만들기 라우트(`app/api/easy/generate/route.ts`)와 그 갈래 턴(`image-turn.ts` ·
 * `cardnews-turn.ts`)이 같이 쓴다(2026-10-07 후속 Task 6 — 라우트를 나누며 옮겼다).
 */
export function 멈춘다(message: string) {
  return Response.json({ ok: false, message, retryable: false }, { status: 400 });
}
