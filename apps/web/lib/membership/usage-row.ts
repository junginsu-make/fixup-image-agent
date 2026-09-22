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
