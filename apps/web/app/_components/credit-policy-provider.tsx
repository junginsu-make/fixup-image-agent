"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { UsageSummary } from "../../lib/membership/types";

const CreditContext = createContext<UsageSummary | null>(null);
export function CreditPolicyProvider({ usage, children }: { usage: UsageSummary; children: ReactNode }) {
  const [current, setCurrent] = useState(usage);
  useEffect(() => setCurrent(usage), [usage]);
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<UsageSummary>).detail;
      if (next && typeof next.remaining === "number") setCurrent(next);
    };
    window.addEventListener("studio-usage-updated", update);
    return () => window.removeEventListener("studio-usage-updated", update);
  }, []);
  return <CreditContext.Provider value={current}>{children}</CreditContext.Provider>;
}
export const useCreditPolicy = () => useContext(CreditContext)?.pricingPolicy ?? "cost-v1";

/**
 * 회원에게 보이는 단위 이름.
 *
 * 기존 기준에서는 「장」이 맞았다 — 깎이는 값이 장수에서 나왔기 때문이다. 새
 * 기준에서는 인쇄용 한 장이 2크레딧이라 **「장」이 더는 단위가 아니다.**
 * 여기 한 곳에 두는 이유는, 같은 삼항식을 화면마다 적으면 한 곳만 빠뜨리기
 * 때문이다 — 리디자인 화면 셋이 실제로 그렇게 빠져 있었다(2026-09-22).
 */
export const useCreditUnit = () => (useCreditPolicy() === "image-v2" ? "크레딧" : "장");
