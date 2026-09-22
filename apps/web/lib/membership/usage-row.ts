import type { UsageSummary } from "./types";

/** Both server rendering and API responses must stop subtracting used units from an actual balance. */
export function usageFromRow(row: Record<string, unknown>): UsageSummary {
  if (row.pricing_policy === "image-v2") {
    const balance = Number(row.balance ?? 0), used = Number(row.used ?? 0), reserved = Number(row.reserved ?? 0);
    const part = (kind: string) => ({ units: Number(row[`${kind}_units`] ?? 0), expiresAt: row[`${kind}_expires_at`] as string | null ?? null });
    return { used, reserved, quota: balance + used, remaining: Number(row.available ?? 0),
      periodStart: String(row.period_start ?? ""), periodEnd: String(row.period_end ?? ""),
      pricingPolicy: "image-v2", balance, subscription: part("subscription"), purchased: part("purchase"), bonus: part("bonus") };
  }
  const used = Number(row.used_units ?? 0), reserved = Number(row.reserved_units ?? 0), quota = Number(row.quota ?? 0);
  return { used, reserved, quota, remaining: Math.max(0, quota - used - reserved), periodStart: String(row.current_period_start ?? ""), periodEnd: String(row.current_period_end ?? ""), pricingPolicy: "cost-v1" };
}

/**
 * 장부가 아직 안 깔린 서버인가.
 *
 * **플래그를 켜고 마이그레이션을 안 돌리면 화면이 통째로 죽는다.** 이 값을 받는
 * 자리가 셋인데(`/settings`·`/guide/credits`·`StudioLayout`) 마지막 하나가
 * 만들기 화면 전부를 감싼다. 순서를 한 번 어기면 회원이 아무것도 못 연다.
 *
 * 그럴 때는 옛 숫자로 버틴다 — 그 서버에는 전환한 계정이 하나도 없으므로 옛
 * 숫자가 맞는 답이다.
 *
 * **아무 오류에나 떨어지지는 않는다.** 전환한 계정에서 잠깐 실패한 것이라면 옛
 * 길은 `monthly_quota` 기준의 **뜻이 다른 숫자**를 준다. 그걸 잔액이라 보여
 * 주면 조용히 거짓말을 하는 것이다. 그래서 「함수가 없다」는 두 코드에만 —
 * PostgREST 의 `PGRST202`(스키마 캐시에 없음)와 PostgreSQL 의 `42883`.
 */
const LEDGER_NOT_INSTALLED = new Set(["PGRST202", "42883"]);
export const ledgerMissing = (error: { code?: string } | null) =>
  Boolean(error && LEDGER_NOT_INSTALLED.has(error.code ?? ""));
