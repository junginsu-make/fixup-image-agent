import { analyzeProduct, toPdpErrorResponse, mapPdpErrorCodeToStatus } from "@fixup/pdp-core";
import type { PdpAnalyzeRequest } from "@fixup/pdp-core";
import { createPdpProviders } from "../../../../lib/pdp/providers";
import { finalizeAiUsage, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";

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
        // 장부가 안 닫혀도 결과는 돌려준다. 여기서 던지면 아래 catch 가 성공한
        // 분석을 「분석 실패」로 바꾸고, 사용자는 다시 눌러 돈을 또 쓴다.
        const usage = await settleAiUsage(reservation, true, 0);
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
