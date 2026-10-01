import { isLocalStoreEnabled } from "../local-store";
import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * **「AI 전체 멈춤」 스위치를 읽는다**(설계 2026-09-30 §3.3).
 *
 * 값은 `app_settings.ai_paused` 에 **정확히 `'1'`/`'0'`** 으로 둔다. `credit_reserve`
 * (202609300001)가 `value='1'` 만 멈춤으로 보므로 여기서도 그렇게만 본다 — 둘이 다르게 읽으면
 * 예약은 막혔는데 카드뉴스는 계속 도는 날이 생긴다.
 *
 * ── 못 읽으면 ──────────────────────────────────────────────
 *
 * **멈추지 않은 것으로 본다**(경고 한 줄). 이 값을 읽는 곳은 이미 예약을 지나 도는 카드뉴스
 * 상태 조회뿐이다. DB 가 잠깐 흔들렸다고 사용자가 돈 낸 작업을 끊으면 안 된다 — 새 요청은
 * 어차피 `credit_reserve` 가 같은 DB 에서 막는다.
 */

export const AI_PAUSED_SETTING_KEY = "ai_paused";

export function aiPausedFrom(value: unknown): boolean {
  return value === "1";
}

export async function isAiPaused(): Promise<boolean> {
  if (isLocalStoreEnabled()) return false;
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("app_settings")
      .select("value")
      .eq("key", AI_PAUSED_SETTING_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return aiPausedFrom(data?.value);
  } catch (error) {
    console.warn("[ai-control] 멈춤 스위치를 읽지 못해 켜진 것으로 봅니다", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
