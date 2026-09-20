import { planFromText, toPdpErrorResponse, mapPdpErrorCodeToStatus } from "@fixup/pdp-core";
import type { CopyIntensity, GapPolicy, TextPlanRequest } from "@fixup/pdp-core";
import { createPdpProviders } from "../../../../lib/pdp/providers";
import { suggestStyleReference } from "../../../../lib/style-reference";
import { settleAiUsage, reserveAiUsage } from "../../../../lib/membership/api";
import { readPdpRequest } from "../../../../lib/pdp/request";
import { withLlmMeter, readLlmMeter } from "../../../../lib/llm/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/*
  **여기는 analyze 와 갈라졌다**(D-3 이후).

  전에는 두 라우트가 같은 고리를 썼다. 그런데 analyze 쪽은 **죽어 있었다** —
  기다리던 `INVALID_REQUEST` 를 그 경로가 안 던진다. 그래서 거기서는 걷어냈고,
  다시 묻는 일을 코어(`pdp.retry-policy`)로 옮겼다.

  **이쪽은 죽어 있지 않다.** `pdp.text-plan.ts` 가 섹션 0개에 `INVALID_REQUEST`
  와 「no sections returned from blueprint model」을 실어 던지므로 아래 정규식에
  실제로 걸린다. 그래서 안 걷어냈다.

  남은 격차: 같은 「섹션 0개」가 두 경로에서 **다른 코드·다른 횟수**로 갈린다
  (분석은 코어가 3회, 텍스트는 라우트가 2회). 텍스트 경로에는 `retryOperation`
  도 `extractResponseText` 도 없어서 한 번에 못 맞춘다 — 그쪽을 손댈 때 함께
  정리한다.
*/
const MAX_PLAN_ATTEMPTS = 2;
const INTENSITIES: CopyIntensity[] = ["plain", "normal", "strong", "max"];
const POLICIES: GapPolicy[] = ["omit", "ask", "sample"];

function isTransientBlueprintFailure(code: unknown, detail?: string) {
  return String(code) === "INVALID_REQUEST" && /prompt_en|no sections|section/i.test(detail ?? "");
}

export async function POST(req: Request) {
  return withLlmMeter(() => plan(req));
}

async function plan(req: Request) {
  const parsed = await readPdpRequest<TextPlanRequest>(req, "plan");
  if (!parsed.ok) return parsed.response;
  // 이미지를 만들지 않는 단계라 크레딧은 소모하지 않는다(시간당 횟수 제한만 적용).
  const reservation = await reserveAiUsage(req, "pdp_analyze", 0);
  if (!reservation.ok) return reservation.response;

  try {
    const rawBody = parsed.body;
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
        const planned = await planFromText(body, providers);
        const result = { ...planned, planningExecutions: providers.llm.executions?.filter((entry) => entry.purpose === "planning") };
        // 레퍼런스 추천은 곁다리다. 실패해도 구성안은 그대로 돌려준다.
        const suggestion = await suggestStyleReference(reservation.userId, result.brief);
        const usage = await settleAiUsage(reservation, true, 0, undefined, { model: "", billableImages: 0, llmUsd: readLlmMeter().usd });
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

    await settleAiUsage(reservation, false, 0, String(lastEnvelope?.code || "plan_from_text_failed"), { model: "", billableImages: 0, llmUsd: readLlmMeter().usd });
    return Response.json(lastEnvelope, { status: lastStatus });
  } catch (err) {
    await settleAiUsage(reservation, false, 0, "invalid_request");
    const envelope = toPdpErrorResponse(err);
    return Response.json(envelope, { status: mapPdpErrorCodeToStatus(envelope.code) });
  }
}
