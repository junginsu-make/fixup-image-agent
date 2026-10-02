import { submitFalQueue, type FalSubmitOptions } from "./http";
import { isFalReceipt, FalRecoveryRequiredError } from "./request-id";

/**
 * **어느 fal 키로 보내고, 보낸 요청을 어느 키로 다시 묻는가.**
 *
 * fal 요청 번호는 계정마다 따로라, 상태·결과·취소는 **보낸 계정의 키**로 해야 한다(설계 §3.3).
 * S3a 에는 서버 키(`FAL_KEY`) 하나뿐이다(`envFalRouter`). S3b 가 같은 모양으로 계정 풀을 끼운다.
 */

export interface FalRoute {
  /** `fal_accounts.id`. 서버 키(`FAL_KEY`)로 보냈으면 null. */
  accountId: string | null;
  key: string;
}

export interface FalRouter {
  /** 제출하고, 어느 키로 보냈는지 함께 돌려준다. 비용 한 줄은 제출이 성공한 자리에서 쓴다. */
  submit(
    endpoint: string,
    input: Record<string, unknown>,
    options?: FalSubmitOptions,
  ): Promise<{ requestId: string; route: FalRoute }>;
  /** 이미 보낸 요청을 물을 키. */
  routeOf(requestId: string): Promise<FalRoute>;
  /** 완료한 처리 자리를 정리한다. DB 일시 실패로 이미 만든 결과를 버리지 않는다. */
  finished(requestId: string): void | Promise<void>;
  /** 참고 그림을 fal 저장소에 올릴 키. */
  uploadRoute(): Promise<FalRoute>;
}

/** 서버 키가 없다. 부르는 쪽이 자기 오류(예: `AI_KEY_MISSING`)로 바꾼다. */
export class FalKeyMissingError extends Error {
  constructor() {
    super("FAL_KEY is not configured.");
    this.name = "FalKeyMissingError";
  }
}

type Env = Record<string, string | undefined>;

/** 서버 키 하나로 보내고 묻는다 — 오늘과 같다. */
export function envFalRouter(environment: Env = process.env, submit = submitFalQueue): FalRouter {
  const route = (): FalRoute => {
    const key = environment.FAL_KEY?.trim();
    if (!key) throw new FalKeyMissingError();
    return { accountId: null, key };
  };
  return {
    async submit(endpoint, input, options) {
      const chosen = route();
      const requestId = await submit(chosen.key, endpoint, input, options);
      return { requestId, route: chosen };
    },
    async routeOf(requestId) {
      if (isFalReceipt(requestId)) throw new FalRecoveryRequiredError();
      return route();
    },
    finished() {},
    async uploadRoute() {
      return route();
    },
  };
}
