import "server-only";
import type { InvokeProvider, ProviderInvocation } from "@fixup/shared";
import { recordedLlmCall } from "../llm/recorded-call";
import { recordedImageCall } from "../generation/recorded-image";
import { imageUnitUsd } from "../credit-cost";

export function directRedesignImagePrice(meta: Pick<ProviderInvocation, "provider" | "model" | "request">): number {
  if (meta.provider === "google" && meta.model === "gemini-3.1-flash-image-preview") return Math.ceil(imageUnitUsd("redesign-google") * 1_000_000);
  if (meta.provider === "openai" && meta.model === "gpt-image-2-2026-04-21") {
    // Preserve the repository's existing quality-specific estimates:
    // 0d2efb8 (low) and e858b28 (high). The fal 2.5 rate is a different provider path.
    if (meta.request.quality === "low") return 20_000;
    if (meta.request.quality === "high") return 210_000;
  }
  throw new Error("price_unavailable");
}
export const invokeRecordedRedesign: InvokeProvider = async (meta, call) => {
  if (meta.kind === "llm") return recordedLlmCall(meta.provider, meta.model, meta.request, call, meta.maxOutputTokens);
  const unit = directRedesignImagePrice(meta);
  const image = await recordedImageCall({ provider: meta.provider, model: meta.model, endpoint: meta.model, identity: meta.request,
    price: { providerUnitMicrousd: unit, chargeUnitMicrousd: unit } }, call, async raw => {
    const data = raw as { data?: Array<{ b64_json?: string }>; candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> };
    const googleImage = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
    const base64 = meta.provider === "google" ? googleImage?.data : data.data?.[0]?.b64_json;
    if (!base64) throw new Error("image_data_missing");
    return { base64, mimeType: googleImage?.mimeType ?? "image/png", providerResponse: raw };
  });
  return image.providerResponse;
};
