import { planFromText, toPdpErrorResponse, mapPdpErrorCodeToStatus } from "@fixup/pdp-core";
import { durablePdpPlanning } from "../../../../lib/pdp/planning-operation";
import { useDurableGeneration as durableGenerationEnabled } from "../../../../lib/generation/run-store";
import type { CopyIntensity, GapPolicy, TextPlanRequest } from "@fixup/pdp-core";
import { createPdpProviders } from "../../../../lib/pdp/providers";
import { suggestStyleReference } from "../../../../lib/style-reference";
import { finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// analyze 라우트와 같은 정책. 구성안 스키마 결손은 모델을 한 번 더 불러 해결한다.
const MAX_PLAN_ATTEMPTS = 2;
const INTENSITIES: CopyIntensity[] = ["plain", "normal", "strong", "max"];
const POLICIES: GapPolicy[] = ["omit", "ask", "sample"];

function isTransientBlueprintFailure(code: unknown, detail?: string) {
  return String(code) === "INVALID_REQUEST" && /prompt_en|no sections|section/i.test(detail ?? "");
}

export async function POST(req: Request) {
  if (durableGenerationEnabled()) return durablePdpPlanning(req, "text");
  // 이미지를 만들지 않는 단계라 크레딧은 소모하지 않는다(시간당 횟수 제한만 적용).
  const reservation = await reserveAiUsage(req, "pdp_analyze", 0);
  if (!reservation.ok) return reservation.response;

  try {
    const rawBody = (await req.json()) as TextPlanRequest;
    const copyIntensity = INTENSITIES.includes(rawBody.copyIntensity as CopyIntensity)
      ? (rawBody.copyIntensity as CopyIntensity)
      : "normal";
    const gapPolicy = POLICIES.includes(rawBody.gapPolicy as GapPolicy)
      ? (rawBody.gapPolicy as GapPolicy)
      : "ask";
    const body = { ...rawBody, copyIntensity, gapPolicy };
    const providers = createPdpProviders();
    let lastEnvelope: ReturnType<typeof toPdpErrorResponse> | null = null;
    let lastStatus = 500;

    for (let attempt = 1; attempt <= MAX_PLAN_ATTEMPTS; attempt++) {
      try {
        const result = await planFromText(body, providers);
        // 레퍼런스 추천은 곁다리다. 실패해도 구성안은 그대로 돌려준다.
        const suggestion = await suggestStyleReference(reservation.userId, result.brief);
        const usage = await finalizeAiUsage(reservation, true, 0);
        return Response.json({
          ok: true,
          result: suggestion.reference
            ? {
                ...result,
                styleReference: {
                  id: suggestion.reference.id,
                  name: suggestion.reference.name,
                  description: suggestion.reference.description,
                  imageBase64: suggestion.reference.imageBase64,
                  mimeType: suggestion.reference.mimeType,
                  reason: suggestion.reason,
                },
              }
            : result,
          usage,
        });
      } catch (err) {
        lastEnvelope = toPdpErrorResponse(err);
        lastStatus = mapPdpErrorCodeToStatus(lastEnvelope.code);
        if (!(attempt < MAX_PLAN_ATTEMPTS && isTransientBlueprintFailure(lastEnvelope.code, lastEnvelope.detail))) {
          break;
        }
      }
    }

    await finalizeAiUsage(reservation, false, 0, String(lastEnvelope?.code || "plan_from_text_failed"));
    return Response.json(lastEnvelope, { status: lastStatus });
  } catch (err) {
    await finalizeAiUsage(reservation, false, 0, "invalid_request");
    const envelope = toPdpErrorResponse(err);
    return Response.json(envelope, { status: mapPdpErrorCodeToStatus(envelope.code) });
  }
}
