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
 */

type Env = Record<string, string | undefined>;

let pool: { secret: string; router: PoolRouter } | null = null;
let warned = false;

export function defaultFalRouter(environment: Env = process.env): FalRouter {
  const secret = environment.FAL_KEY_ENCRYPTION_SECRET;
  const master = readMasterKey(secret);
  if (!master.ok) {
    if (environment === process.env) warnIfAccountsWaiting(master.reason);
    return envFalRouter(environment);
  }
  if (!pool || pool.secret !== secret) {
    pool = {
      secret: secret as string,
      router: createPoolRouter({ store: supabaseFalPoolStore(), masterKey: master.key, environment, alert: sendFalPoolAlert }),
    };
  }
  return pool.router;
}

/** 관리자 화면이 계정을 바꾼 직후 — 다음 제출부터 새 목록을 쓴다. */
export function refreshFalPool(): void {
  pool?.router.refresh();
}

function warnIfAccountsWaiting(reason: "missing" | "invalid"): void {
  if (warned) return;
  warned = true;
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
    .catch(() => undefined);
}
