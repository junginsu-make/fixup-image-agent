import { analyzeProduct, toPdpErrorResponse, mapPdpErrorCodeToStatus } from "@fixup/pdp-core";
import type { PdpAnalyzeRequest } from "@fixup/pdp-core";
import { createPdpProviders } from "../../../../lib/pdp/providers";
import { sliceTallReference } from "../../../../lib/pdp/slice-image";
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

    /*
      세로로 긴 레퍼런스를 조각으로 나눠 넘긴다.

      상세페이지 레퍼런스는 1080×10000 처럼 아주 길다. 통째로 보내면 모델이
      긴 변 기준으로 줄여 폭 100픽셀짜리 띠가 된다 — 글꼴도 배치도 안 보인다.
      자르는 일은 여기서 한다. `pdp-core` 는 순수해야 하고 sharp 는 서버 것이다.
    */
    const styleReference = body.styleReference
      ? { ...body.styleReference, slices: await sliceTallReference(body.styleReference) }
      : undefined;
    const request = { ...body, styleReference };
    let lastEnvelope: ReturnType<typeof toPdpErrorResponse> | null = null;
    let lastStatus = 500;
    for (let attempt = 1; attempt <= MAX_ANALYZE_ATTEMPTS; attempt++) {
      try {
        const result = await analyzeProduct(request, providers, { skipFirstImage: true });
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
