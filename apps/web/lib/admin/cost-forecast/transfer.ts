import type { Scenario } from "./schema";
import type { Usage } from "./usage";
import { sumKnown } from "./inventory";

export interface Transfers { cachedGB: number | null; uncachedGB: number | null; awsGB: number | null; }
export function transferUsage(usage: Usage, averageGB: number | null, uploadGB: number | null, t: Scenario["transfers"]): Transfers {
  // Average portfolio original/preview split; zero output months retain the caller's last ratio.
  const total = sumKnown(usage.originalMB, usage.previewMB);
  const originalShare = total === null ? null : total > 0 ? usage.originalMB! / total : 2 / 2.05;
  const previewShare = originalShare === null ? null : 1 - originalShare;
  const original = averageGB === null || originalShare === null || t.downloadsPerImage === null ? null : averageGB * originalShare * t.downloadsPerImage;
  const preview = averageGB === null || previewShare === null || t.viewsPerImage === null ? null : averageGB * previewShare * t.viewsPerImage;
  const browse = sumKnown(original, preview);
  const afterBrowser = browse === null ? null : browse * (1 - t.browserCachePct / 100);
  const references = t.referenceMBPerOutput === null ? null : usage.providerOutputs * t.referenceMBPerOutput / 1000;
  const storageOutbound = sumKnown(afterBrowser, references);
  const cachedGB = sumKnown(storageOutbound === null ? null : storageOutbound * t.cdnCachePct / 100, t.otherCachedGB);
  const uncachedGB = sumKnown(storageOutbound === null ? null : storageOutbound * (1 - t.cdnCachePct / 100), t.otherUncachedGB);
  // API response, upload, and reused references are not page views. Do not cache them away.
  const response = usage.responseMB === null ? null : usage.responseMB / 1000 * t.generationResponseFactor;
  const upload = uploadGB === null ? null : Math.max(0, uploadGB) * t.uploadAwsPct / 100;
  const awsGB = sumKnown(afterBrowser === null ? null : afterBrowser * t.proxyPct / 100, references, response, upload, t.otherAwsGB);
  return { cachedGB, uncachedGB, awsGB };
}

export function awsTransferCost(gb: number | null, t: Scenario["transfers"]): number | null {
  if (gb === null || t.awsFreeGB === null) return null;
  let remaining = Math.max(0, gb - t.awsFreeGB);
  if (remaining === 0) return 0;
  if (!t.awsTiers.length) return t.awsPerGB === null ? null : remaining * t.awsPerGB;
  let total = 0, previous = 0;
  for (const tier of [...t.awsTiers].sort((a, b) => a.upToGB - b.upToGB)) {
    const size = Math.min(remaining, tier.upToGB - previous); total += size * tier.usdPerGB; remaining -= size; previous = tier.upToGB;
  }
  if (remaining > 0 && t.awsPerGB === null) return null;
  return total + remaining * (t.awsPerGB ?? 0);
}
