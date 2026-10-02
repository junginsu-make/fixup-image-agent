import type { UsageSummary } from "./types";
import { jobDone } from "../running-jobs";
export const ACCOUNT_CHANGED = "studio-account-changed";
export const CREDIT_SHORTAGE = "studio-credit-shortage";
export type CreditShortage = { code: "credits_required" | "quota_exceeded"; message: string };
export const isCreditShortage = (code: unknown): code is CreditShortage["code"] => code === "credits_required" || code === "quota_exceeded";
export function invalidateAccount() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACCOUNT_CHANGED));
}
export function observeAccountResponse(value: unknown, changed = false) {
  if (!value || typeof value !== "object" || typeof window === "undefined") return;
  const body = value as { code?: unknown; message?: unknown; usage?: UsageSummary };
  if (isCreditShortage(body.code)) {
    window.dispatchEvent(new CustomEvent(CREDIT_SHORTAGE, { detail: { code: body.code, message: typeof body.message === "string" ? body.message : "크레딧이 부족합니다." } }));
  }
  if (changed || body.usage || jobDone(value) || isCreditShortage(body.code)) invalidateAccount();
}
/** JSON을 이미 읽는 경로에서 사용한다. Response/멱등키/스트림 계약은 바꾸지 않는다. */
export async function readAccountResponse(response: Response, changed = false) {
  const body = await response.json();
  observeAccountResponse(body, changed);
  return body;
}
