import type { UsageSummary } from "./types";
export type SubscriptionSummary =
  | { state: "none" }
  | { state: "unavailable" }
  | { state: "present"; status: "active" | "canceled" | "suspended";
      plan: { id: string; name: string; monthlyUnits: number; priceKrw: number };
      startedAt: string; cancelAt: string | null;
      currentPeriod: null | { period: string; startsAt: string; expiresAt: string; grantedUnits: number; paidKrw: number };
    };
export type AccountSummary = { usage: UsageSummary; subscription: SubscriptionSummary; fetchedAt: string };
