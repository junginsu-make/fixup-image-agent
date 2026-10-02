import { stepIdempotencyKey } from "./step-key";
import type { UsageSummary } from "../membership/types";

/**
 * 「쉽게」가 다른 라우트를 **함수로** 부를 때 쓰는 셋(1단계 라우트에서 옮겼다).
 *
 * 2단계에서 카드뉴스 라우트도 같은 방식으로 부르고, 「이대로 만들기」 라우트가 따로
 * 생겨서 한 곳에 둔다. 내용은 옮기기 전과 같다.
 */

/**
 * 라우트 하나를 부른다.
 *
 * **쿠키를 물려준다.** 세 라우트가 각자 `authenticateApiMember` 로 회원을
 * 확인하고 저장소도 회원 권한으로 연다. 원래 요청의 헤더를 그대로 넘겨야 그
 * 확인이 같은 사람으로 통과한다.
 *
 * **요청 식별자만 갈아 끼운다**(2026-09-21 운영 409).
 *
 * 세 라우트 중 **둘이 각자 예약한다** — 기획과 생성이다. 예약은 같은 식별자를
 * 두 번 받으면 `duplicate_request` 로 거절하므로, 그대로 물려주면 **두 번째
 * 단계가 반드시 막힌다.**
 *
 * 포스터 화면은 이 함정에 안 빠진다. 기획과 생성이 사용자의 서로 다른 누름이고
 * 누를 때마다 새 열쇠가 나가기 때문이다. Easy 는 한 번 누르면 셋이 이어 도는
 * 구조라 **우리가 갈라 줘야 한다.**
 */
export function relay(request: Request, url: string, body: unknown, step: string): Request {
  const headers = new Headers(request.headers);
  const 바깥열쇠 = headers.get("x-idempotency-key");
  // 바깥 열쇠가 없으면 갈라 줄 것도 없다. 안쪽이 400 으로 막고 그것이 맞다.
  if (바깥열쇠) headers.set("x-idempotency-key", stepIdempotencyKey(바깥열쇠, step));

  return new Request(new URL(url, request.url), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** 라우트의 답을 읽는다. 실패하면 그 라우트가 준 말을 그대로 올린다. */
export async function read(response: Response, step: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    /*
     * **오류를 뭉개지 않는다**(설계 §5-3). 「문제가 생겼습니다」로 덮으면
     * 사용자는 무엇을 고쳐야 할지 모르고, 같은 것을 또 눌러 값만 나간다.
     * 어디서 실패했는지와 그 라우트가 준 말을 함께 올린다.
     *
     * **다시 눌러도 안 풀린다고 안쪽이 말했으면 그대로 옮긴다**(설계 2026-09-30 §3.2).
     * 멈춤(503)은 상태 코드만으로는 「잠시 뒤 다시」와 가를 수 없다.
     */
    const shortage = body.code === "credits_required" || body.code === "quota_exceeded";
    const usage = shortage && body.usage && [body.usage.remaining, body.usage.used, body.usage.reserved].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) ? body.usage as UsageSummary : undefined;
    throw new EasyStepError(step, body.message ?? `${step} 단계가 실패했습니다.`, response.status, !shortage && body.retryable !== false, shortage ? body.code : undefined, usage);
  }
  return body;
}

export class EasyStepError extends Error {
  constructor(readonly step: string, message: string, readonly status: number, readonly retryable = true,
    readonly code?: "credits_required" | "quota_exceeded", readonly usage?: UsageSummary) {
    super(message);
    this.name = "EasyStepError";
  }
}
