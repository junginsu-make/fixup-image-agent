/** Customer charge policy is independent of provider cost. Keep cost-v1 replayable. */
export type CreditPolicyId = "cost-v1" | "image-v2";
export interface CreditOutput { width: number; height: number; }
export const IMAGE_CREDIT_POLICY = Object.freeze({
  id: "image-v2" as const,
  version: "2026-09-22.1",
  largePixelThreshold: 6_000_000,
  normalUnits: 1,
  largeUnits: 2,
  // Tier classification is a business proposal, not a verified supplier price ceiling.
  costCeilingVerified: false,
});

export function imageCredits(size: CreditOutput): number {
  if (![size.width, size.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 16000)) {
    throw new Error("과금할 이미지의 확정 크기가 필요합니다.");
  }
  return size.width * size.height >= IMAGE_CREDIT_POLICY.largePixelThreshold
    ? IMAGE_CREDIT_POLICY.largeUnits : IMAGE_CREDIT_POLICY.normalUnits;
}

export function quoteCredits(policy: CreditPolicyId, input: { legacyUnits: number; outputs: readonly CreditOutput[] }) {
  if (!Number.isSafeInteger(input.legacyUnits) || input.legacyUnits < 0) throw new Error("기존 크레딧 값이 올바르지 않습니다.");
  if (policy !== "cost-v1" && policy !== "image-v2") throw new Error("알 수 없는 차감 정책입니다.");
  const perOutput = input.outputs.map(imageCredits);
  return { policy, units: policy === "cost-v1" ? input.legacyUnits : perOutput.reduce((n, x) => n + x, 0), perOutput };
}

const KST_OFFSET = 9 * 60 * 60 * 1000;
function localDate(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("지급 시각이 올바르지 않습니다.");
  return new Date(date.getTime() + KST_OFFSET);
}
/** Calendar months in Korea; preserve time of day and clamp Jan 31 to Apr 30. */
export function purchaseExpiresAt(grantedAt: string | Date): string {
  const date = localDate(grantedAt), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 3);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return new Date(date.getTime() - KST_OFFSET).toISOString();
}
export function subscriptionExpiresAt(grantedAt: string | Date): string {
  const date = localDate(grantedAt);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - KST_OFFSET).toISOString();
}

/** Examples, not promises about variable AI-generated plans or the current form defaults. */
export const WORK_CREDIT_PRESETS = [
  { id: "pdp", label: "상세페이지 예시 · 8섹션+대표1", images: 9 },
  { id: "cardnews", label: "카드뉴스 예시 · 8장", images: 8 },
  { id: "poster", label: "포스터 · 1장", images: 1 },
] as const;

export function workCreditExamples(available: number) {
  return WORK_CREDIT_PRESETS.map(p => ({ ...p, count: Math.floor(Math.max(0, available) / p.images) }));
}
