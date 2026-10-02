import "server-only";
import { cache } from "react";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalAuthBypass } from "../dev-auth";
import { getUsageSummary } from "./server";
import type { AccountSummary, SubscriptionSummary } from "./account-types";

export async function readSubscription(userId: string, period: string): Promise<SubscriptionSummary> {
  try {
    const db = createSupabaseAdminClient();
    const { data: subscription, error } = await db.from("user_subscriptions")
      .select("plan_id,status,started_at,cancel_at").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!subscription) return { state: "none" };
    if (!["active", "canceled", "suspended"].includes(subscription.status)) throw new Error("Invalid subscription status");
    const [planResult, periodResult] = await Promise.all([
      db.from("subscription_plans").select("id,name,monthly_units,price_krw").eq("id", subscription.plan_id).single(),
      db.from("subscription_periods").select("period,starts_at,expires_at,units,paid_amount_krw").eq("user_id", userId).eq("period", period).maybeSingle(),
    ]);
    if (planResult.error || periodResult.error || !planResult.data) throw new Error("Subscription lookup failed");
    const p = planResult.data, paid = periodResult.data;
    return { state: "present", status: subscription.status, startedAt: subscription.started_at, cancelAt: subscription.cancel_at,
      plan: { id: p.id, name: p.name, monthlyUnits: p.monthly_units, priceKrw: p.price_krw },
      currentPeriod: paid ? { period: paid.period, startsAt: paid.starts_at, expiresAt: paid.expires_at, grantedUnits: paid.units, paidKrw: paid.paid_amount_krw } : null };
  } catch {
    console.error("[account] 구독 정보를 확인하지 못했습니다");
    return { state: "unavailable" };
  }
}
export const getAccountSummary = cache(async (userId: string): Promise<AccountSummary> => {
  const usage = await getUsageSummary(userId);
  const subscription = isLocalAuthBypass || usage.pricingPolicy !== "image-v2"
    ? { state: "none" as const } : await readSubscription(userId, usage.periodStart);
  return { usage, subscription, fetchedAt: new Date().toISOString() };
});
/** SSR에서도 실패를 0크레딧으로 바꾸지 않는다. API는 별도로 실패 상태를 반환한다. */
export async function initialAccountSummary(userId: string): Promise<AccountSummary | null> {
  try { return await getAccountSummary(userId); }
  catch { console.error("[account] 잔액을 확인하지 못했습니다"); return null; }
}
