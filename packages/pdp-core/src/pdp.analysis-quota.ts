/**
 * **못 만든 분석이 한도를 먹지 않게 한다**(C-9).
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────
 *
 * 분석은 시간당 열 번으로 묶여 있다(`ANALYZE_HOURLY_LIMIT`). 그런데 그 수를
 * 세는 SQL 은 **실패한 시도까지 함께 센다** — 키가 안 꽂혀 있거나 공급자가
 * 죽어 있어도 한 칸이 사라진다.
 *
 * 사용자는 아무것도 못 받고 한도만 잃는다. 열 번을 그렇게 잃으면 한 시간을
 * 기다려야 한다.
 *
 * ── 왜 전부 면제하지 않나 ────────────────────────────────────
 *
 * 면제를 넓게 잡으면 **실패를 만들어 내며 한도를 우회**할 수 있다. 설계가
 * 「정책 분리 수정, **남용 제한은 유지**」라 적은 이유다. SQL 쪽에는 면제와
 * 무관하게 **모든 시도**를 세는 천장이 따로 있다.
 *
 * ── 가르는 기준 하나 ─────────────────────────────────────────
 *
 * **모델이 실제로 일했는가.** 부르기 전에 끝났거나 공급자가 손도 안 댄 실패는
 * 면제하고, 답이 돌아온 뒤의 실패는 값이 이미 나갔으니 먹는다.
 */

/**
 * 한도를 안 먹는 실패 코드.
 *
 * **SQL 도 같은 목록을 쓴다**(`supabase/migrations/202609200001_analysis_quota_policy.sql`).
 * 두 벌이 어긋나면 한도가 뚫리거나 멀쩡한 사용자가 한 시간을 기다린다.
 * `apps/web/lib/membership/__tests__/analysis-quota-migration.test.ts` 가 두 벌을
 * 맞대 본다.
 */
export const ANALYSIS_QUOTA_EXEMPT_CODES = [
  /** 열쇠가 없다. 부를 수조차 없었다. */
  "AI_KEY_MISSING",
  /** 열쇠가 틀렸다. 공급자가 문턱에서 돌려보냈다. */
  "AI_KEY_INVALID",
  /** 이 열쇠로는 그 모델을 못 쓴다. 역시 문턱이다. */
  "AI_MODEL_ACCESS_DENIED",
  /** 우리 몫을 다 썼다. 사용자 잘못이 아니고, 받은 것도 없다. */
  "AI_QUOTA_EXCEEDED",
  /** 공급자가 죽어 있거나 과부하다. 손도 안 댔다. */
  "AI_PROVIDER_UNAVAILABLE",
  /** 그림을 못 읽었다. 모델을 부르기 전에 끝난다. */
  "INVALID_IMAGE_PAYLOAD",
  /**
   * 예약만 하고 안 닫힌 행. SQL 이 예약 만료로 스스로 찍는다 — 이미 면제하고
   * 있었고, 그 판단을 여기로 옮겨 적는다.
   */
  "reservation_expired",
] as const;

const EXEMPT = new Set<string>(ANALYSIS_QUOTA_EXEMPT_CODES);

/**
 * 이 결과가 시간당 분석 한도를 **먹는가**.
 *
 * **모르는 코드는 먹는 쪽으로 둔다.** 면제를 넓히면 한도가 뚫린다 — 새 코드가
 * 생겼을 때 조용히 우회로가 되는 것보다, 한 번 더 기다리는 쪽이 낫다.
 *
 * `INVALID_REQUEST` 가 여기 없는 것은 실수가 아니다. 요청 모양이 틀린 것은
 * `readPdpRequest` 가 **예약 전에** 되돌려 보내 행 자체가 안 생긴다. 예약 뒤에
 * 그 코드가 나오는 자리는 **모델이 쓴 설계도를 못 읽은 경우**뿐이라, 값은 이미
 * 나간 뒤다.
 */
export function consumesAnalysisQuota(errorCode: string | null | undefined): boolean {
  if (!errorCode) return true;
  return !EXEMPT.has(errorCode);
}
