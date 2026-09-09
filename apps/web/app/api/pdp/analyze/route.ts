import { analyzeProduct, toPdpErrorResponse, mapPdpErrorCodeToStatus } from "@fixup/pdp-core";
import type { PdpAnalyzeRequest } from "@fixup/pdp-core";
import { createPdpProviders } from "../../../../lib/pdp/providers";
import { finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const MAX_ANALYZE_ATTEMPTS = 2;

function isTransientBlueprintFailure(code: unknown, detail?: string) {
  return String(code) === "INVALID_REQUEST" && /prompt_en|no sections|section/i.test(detail ?? "");
}

export async function POST(req: Request) {
  const reservation = await reserveAiUsage(req, "pdp_analyze", 0);
  if (!reservation.ok) return reservation.response;
  try {
    const body = (await req.json()) as PdpAnalyzeRequest;
    const providers = createPdpProviders();
    let lastEnvelope: ReturnType<typeof toPdpErrorResponse> | null = null;
    let lastStatus = 500;
    for (let attempt = 1; attempt <= MAX_ANALYZE_ATTEMPTS; attempt++) {
      try {
        const result = await analyzeProduct(body, providers, { skipFirstImage: true });
        const usage = await finalizeAiUsage(reservation, true, 0);
        return Response.json({ ok: true, result, usage });
      } catch (err) {
        lastEnvelope = toPdpErrorResponse(err);
        lastStatus = mapPdpErrorCodeToStatus(lastEnvelope.code);
        if (!(attempt < MAX_ANALYZE_ATTEMPTS && isTransientBlueprintFailure(lastEnvelope.code, lastEnvelope.detail))) break;
      }
    }
    await finalizeAiUsage(reservation, false, 0, String(lastEnvelope?.code || "analyze_failed"));
    return Response.json(lastEnvelope, { status: lastStatus });
  } catch (err) {
    await finalizeAiUsage(reservation, false, 0, "invalid_request");
    const envelope = toPdpErrorResponse(err);
    return Response.json(envelope, { status: mapPdpErrorCodeToStatus(envelope.code) });
  }
}
