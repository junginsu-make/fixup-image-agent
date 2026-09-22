import { modelById, resolvePosterSize, sizeFromSource, CARD_RATIOS } from "@fixup/sns-core";
import { buildFalPayload, type AspectRatio, type ImageModelId } from "@fixup/pdp-core";
import type { CreditOutput } from "@fixup/shared";

function fixedSize(ratio: string, edge = 2048): CreditOutput {
  const parts = ratio.split(":").map(Number), width = parts[0], height = parts[1];
  if (!width || !height || !Number.isFinite(width / height)) throw new Error("이미지 비율을 확인하세요.");
  return width >= height ? { width: edge, height: Math.max(1, Math.round(edge * height / width)) } : { width: Math.max(1, Math.round(edge * width / height)), height: edge };
}

export function posterCreditSize(modelId: string, ratio: string, source?: CreditOutput): CreditOutput {
  const model = modelById(modelId);
  if (ratio === "match-source" && !source) throw new Error("크레딧을 계산하려면 첨부 이미지의 크기를 먼저 확인해야 합니다.");
  const resolved = ratio === "match-source" ? sizeFromSource(source!, model) : resolvePosterSize(ratio, model);
  if (resolved.rejected) throw new Error(resolved.rejected);
  if (resolved.pixel) return resolved.pixel;
  const edge = model.fixedResolution === "4K" ? 4096 : model.fixedResolution === "1K" ? 1024 : 2048;
  return fixedSize(resolved.aspectRatio ?? ratio, edge);
}

export function pdpCreditSize(model: string, ratio: string = "3:4"): CreditOutput {
  const payload = buildFalPayload(model as ImageModelId, { prompt: "", systemPrompt: "", aspectRatio: ratio as AspectRatio, references: [] });
  const size = payload.image_size;
  if (size && typeof size === "object" && "width" in size && "height" in size) return size as CreditOutput;
  // The current non-pixel PDP endpoints use normal-size presets/2K outputs, never print-size.
  if (typeof size === "string") return fixedSize(ratio, 1536);
  return fixedSize(String(payload.aspect_ratio ?? ratio), payload.resolution === "4K" ? 4096 : 2048);
}

export function snsCreditSize(ratio: string): CreditOutput {
  const found = CARD_RATIOS.find(x => x.id === ratio);
  if (!found) throw new Error("카드 크기를 확인하세요.");
  return found.pixel;
}

/** Legacy jobs may lack dimensions. Missing quotes fail closed only for migrated accounts. */
export function knownPosterCreditSize(modelId: string, ratio: string, source?: CreditOutput): CreditOutput | undefined {
  try { return posterCreditSize(modelId, ratio, source); } catch { return undefined; }
}
