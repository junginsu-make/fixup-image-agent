import { envFalRouter, type FalRouter } from "../route";
import { sendFalPoolAlert } from "./alert";
import { readMasterKey } from "./key-crypto";
import { createPoolRouter, type PoolRouter } from "./router";
import { supabaseFalPoolStore } from "./store";

/**
 * 생성 경로가 쓰는 fal 길 하나.
 *
 * - 서버 열쇠(`FAL_KEY_ENCRYPTION_SECRET`)가 **없거나 틀리면** 풀을 끄고 `FAL_KEY` 로 보낸다 — 배포 첫날
 *   생성이 멈추면 안 된다. 그때 등록된 계정이 있으면 한 번 경고하고 관리자에게 메일(조용히 넘어가지 않는다)
 * - 열쇠가 있으면 프로세스에 풀 하나(계정 목록 30초 보관). 계정이 없으면 그 풀도 `FAL_KEY` 로 보낸다
 *
 * **모듈 스코프 변수 대신 `globalThis` 에 심는다**(fix round 1, `lib/runtime/boot-id.ts` 와 같은 까닭).
 * Next 는 이 모듈을 `app/api` 라우트와 서버 액션(관리자 화면의 `refreshFalPool()`)처럼 서로 다른 번들
 * 레이어에서 따로 인스턴스화할 수 있다 — 모듈 스코프에 두면 그 둘이 **다른 풀**을 들고 있게 돼, 관리자가
 * 계정을 고쳐 `refresh()` 를 불러도 생성 쪽 풀은 그대로 30초를 더 묵은 목록으로 간다.
 */

type Env = Record<string, string | undefined>;

interface FalPoolHolder {
  pool: { secret: string; router: PoolRouter } | null;
  warned: boolean;
}

const holder: FalPoolHolder = ((globalThis as typeof globalThis & { __fixupFalPool?: FalPoolHolder })
  .__fixupFalPool ??= { pool: null, warned: false });

export function defaultFalRouter(environment: Env = process.env): FalRouter {
  const secret = environment.FAL_KEY_ENCRYPTION_SECRET;
  const master = readMasterKey(secret);
  if (!master.ok) {
    if (environment === process.env) warnIfAccountsWaiting(master.reason);
    return envFalRouter(environment);
  }
  if (!holder.pool || holder.pool.secret !== secret) {
    holder.pool = {
      secret: secret as string,
      router: createPoolRouter({ store: supabaseFalPoolStore(), masterKey: master.key, environment, alert: sendFalPoolAlert }),
    };
  }
  return holder.pool.router;
}

/** 관리자 화면이 계정을 바꾼 직후 — 다음 제출부터 새 목록을 쓴다. */
export function refreshFalPool(): void {
  holder.pool?.router.refresh();
}

function warnIfAccountsWaiting(reason: "missing" | "invalid"): void {
  if (holder.warned) return;
  holder.warned = true;
  if (reason === "invalid") {
    console.error("[fal-pool] FAL_KEY_ENCRYPTION_SECRET 이 32바이트 base64 가 아닙니다. 계정 풀을 끄고 FAL_KEY 로 만듭니다.");
  }
  // 기다리지 않는다. Supabase 가 없는 로컬·시험에서는 조용히 끝난다.
  void Promise.resolve()
    .then(() => supabaseFalPoolStore().liveAccounts())
    .then((rows) => {
      if (rows.length === 0) return;
      void sendFalPoolAlert({ kind: "master_key_missing", accountName: "", detail: `등록된 계정 ${rows.length}개` });
    })
    .catch((error: unknown) => {
      // 삼키지 않는다 — 조용히 넘기면 배포 첫날 풀이 꺼진 것 자체를 아무도 모른다.
      console.error("[fal-pool] 계정 수를 확인하지 못했습니다", error instanceof Error ? error.message : String(error));
    });
}
