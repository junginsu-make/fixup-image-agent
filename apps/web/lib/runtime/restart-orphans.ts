import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isCreditLedgerEnabled } from "../membership/credit-ledger";
import { BOOT_ID } from "./boot-id";

/**
 * `../local-store` 의 것과 같은 조건(그 파일 :129-131) 을 여기 따로 둔다. 그 모듈은
 * `node:fs`·`node:fs/promises`·`node:path` 를 최상단에서 불러오는데, 이 파일은
 * `instrumentation.ts` 에서 불리고 그 파일은 미들웨어 때문에 edge 번들로도 컴파일된다
 * (build fix, 시험 서버 실측 — `UnhandledSchemeError: node:path`). edge 번들은 그 스킴을
 * 아예 못 읽어 **어느 쪽도 안 부르는 조건문 뒤라도** 빌드가 죽는다. 값이 갈리면 안 되니
 * 바꿀 때 두 자리를 같이 바꾼다 — 원본과 시그니처(선택 인자 하나, 기본값 `process.env`)도
 * 그대로 맞춰 뒀다. 동등성은 `__tests__/restart-orphans.test.ts` 가 원본과 나란히 부르며 잰다.
 */
export function isLocalStoreEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== "production" && environment.LOCAL_STORE === "1";
}

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

type RestartCleanupResult = { released?: number; needs_review?: number; failed?: number };

/**
 * **켜질 때 한 번, 직전 프로세스가 끝내지 못한 동기 생성 예약을 정리한다**(설계 §3.5).
 *
 * 무엇을 고르고 어떻게 닫는지는 DB 함수(`202609290001`)가 정한다. 여기서는 부르기만 한다.
 * 실패해도 기동은 계속한다 — 남은 예약은 다음 기동 때 다시 본다. 기다리지도 않는다
 * (`instrumentation.ts` 가 결과를 안 기다린다).
 *
 * 결과에는 이 프로세스의 표식(`BOOT_ID`)을 같이 남긴다 — 여러 기동의 로그가 섞여도 어느
 * 프로세스가 무엇을 정리했는지 가릴 수 있게(R3). `failed` 가 하나라도 있으면 기동은
 * 막지 않되 오류 레벨 로거를 따로 불러 손으로 봐야 할 것이 있다는 신호를 남긴다(R7).
 */
export async function closeRestartOrphans(options: {
  rpc?: Rpc;
  log?: (message: string, detail?: unknown) => void;
  error?: (message: string, detail?: unknown) => void;
} = {}): Promise<void> {
  const log = options.log ?? ((message, detail) => console.info(message, detail ?? ""));
  const logError = options.error ?? ((message, detail) => console.error(message, detail ?? ""));
  if (!isCreditLedgerEnabled() || isLocalStoreEnabled()) return;
  const rpc: Rpc = options.rpc ?? (async (name, args) => {
    const { data, error } = await createSupabaseAdminClient().rpc(name, args);
    return { data, error: error ? { message: error.message } : null };
  });
  try {
    const { data, error } = await rpc("credit_close_restart_orphans", { p_boot: BOOT_ID });
    if (error) {
      log("[restart] 묶인 예약 정리 실패", { boot: BOOT_ID, message: error.message });
      return;
    }
    const result = (data ?? {}) as RestartCleanupResult;
    log("[restart] 묶인 예약 정리", { boot: BOOT_ID, ...result });
    if ((result.failed ?? 0) > 0) {
      logError("[restart] 묶인 예약 일부를 정리하지 못했습니다. 손으로 확인해야 합니다", { boot: BOOT_ID, ...result });
    }
  } catch (error) {
    log("[restart] 묶인 예약 정리 실패", { boot: BOOT_ID, message: error instanceof Error ? error.message : String(error) });
  }
}
