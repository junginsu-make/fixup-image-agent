"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { UsageSummary } from "../../lib/membership/types";
import type { AccountSummary, SubscriptionSummary } from "../../lib/membership/account-types";
import { createAccountRefresh } from "../../lib/membership/account-refresh";
import { ACCOUNT_CHANGED, CREDIT_SHORTAGE, isCreditShortage, type CreditShortage } from "../../lib/membership/account-events";

type AccountContext = {
  usage: UsageSummary | null; subscription: SubscriptionSummary | null;
  refreshing: boolean; error: string; shortage: CreditShortage | null;
  refresh(): Promise<void>; dismissShortage(): void;
};
const CreditContext = createContext<AccountContext | null>(null);
type Props = { usage: UsageSummary | null; subscription?: SubscriptionSummary | null; userId?: string; children: ReactNode };
export function CreditPolicyProvider(props: Props) {
  return <AccountProvider key={props.userId ?? "local"} {...props} />;
}
function AccountProvider({ usage, subscription = null, userId, children }: Props) {
  const [current, setCurrent] = useState(usage);
  const [plan, setPlan] = useState(subscription);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(usage ? "" : "크레딧을 확인하지 못했습니다.");
  const [shortage, setShortage] = useState<CreditShortage | null>(null);
  const controller = useRef<ReturnType<typeof createAccountRefresh<AccountSummary>> | null>(null);
  const seed = useRef({ usage, subscription });
  useEffect(() => {
    const refresh = createAccountRefresh<AccountSummary>({
      read: async (signal) => {
        const response = await fetch("/api/account/summary", { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
        if (!response.ok) throw Object.assign(new Error("account_unavailable"), { status: response.status });
        const body = await response.json() as AccountSummary;
        if (!body.usage || ![body.usage.remaining, body.usage.used, body.usage.reserved].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) throw new Error("invalid_account_summary");
        return body;
      },
      accept: (body) => { setCurrent(body.usage); setPlan(body.subscription); setError(""); },
      fail: (cause) => {
        const denied = [401, 403].includes((cause as { status?: number })?.status ?? 0);
        if (denied) { setCurrent(null); setPlan(null); setShortage(null); }
        setError(denied ? "로그인 및 계정 상태를 확인해 주세요." : "잔액 확인이 지연되고 있습니다. 다시 확인해 주세요.");
      },
      pending: setRefreshing,
    });
    controller.current = refresh;
    const channel = userId && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`account:${userId}`) : null;
    const changed = () => { void refresh.request(); channel?.postMessage("changed"); };
    const received = () => { void refresh.request(); };
    const visible = () => { if (document.visibilityState === "visible") void refresh.request(true); };
    const showShortage = (event: Event) => {
      const detail = (event as CustomEvent<CreditShortage>).detail;
      if (detail && isCreditShortage(detail.code)) setShortage(detail);
    };
    channel?.addEventListener("message", received);
    window.addEventListener(ACCOUNT_CHANGED, changed);
    window.addEventListener("studio-usage-updated", changed);
    window.addEventListener(CREDIT_SHORTAGE, showShortage);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh.request(); }, 60_000);
    void refresh.request(true);
    return () => {
      refresh.dispose(); controller.current = null; clearInterval(timer); channel?.close();
      window.removeEventListener(ACCOUNT_CHANGED, changed);
      window.removeEventListener("studio-usage-updated", changed);
      window.removeEventListener(CREDIT_SHORTAGE, showShortage);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId]);
  useEffect(() => {
    if (seed.current.usage === usage && seed.current.subscription === subscription) return;
    seed.current = { usage, subscription };
    void controller.current?.request(true);
  }, [usage, subscription]);
  return <CreditContext.Provider value={{ usage: current, subscription: plan, refreshing, error, shortage,
    refresh: () => controller.current?.request(true) ?? Promise.resolve(), dismissShortage: () => setShortage(null) }}>{children}</CreditContext.Provider>;
}
export const useAccountSummary = () => useContext(CreditContext);
export const useCreditPolicy = () => useContext(CreditContext)?.usage?.pricingPolicy ?? "cost-v1";
export const useCreditUnit = () => (useCreditPolicy() === "image-v2" ? "크레딧" : "장");
