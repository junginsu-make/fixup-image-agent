import { readLlmMeter, withLlmMeter } from "../../../../lib/llm/meter";
import { durablePdpPlanning } from "../../../../lib/pdp/planning-operation";
import { isDurableGenerationEnabled as durableGenerationEnabled } from "../../../../lib/generation/run-store";
import { analyzeProduct, toPdpErrorResponse, mapPdpErrorCodeToStatus } from "@fixup/pdp-core";
import type { PdpAnalyzeRequest } from "@fixup/pdp-core";
import { createPdpProviders } from "../../../../lib/pdp/providers";
import { sliceTallReference } from "../../../../lib/pdp/slice-image";
import { finalizeAiUsage, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const MAX_ANALYZE_ATTEMPTS = 2;

function isTransientBlueprintFailure(code: unknown, detail?: string) {
  return String(code) === "INVALID_REQUEST" && /prompt_en|no sections|section/i.test(detail ?? "");
}

export async function POST(req: Request) {
  if (durableGenerationEnabled()) return durablePdpPlanning(req, "analyze");
  // 이 요청에서 글 모델에 쓴 돈을 잰다. 안쪽 어디서 부르든 여기로 모인다.
  return withLlmMeter(() => analyze(req));
}

async function analyze(req: Request) {
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
      ? {
          ...body.styleReference,
          // 기획 요청은 여러 번 나간다. 읽는 값은 1024px 이면 충분하다.
          slices: await sliceTallReference(body.styleReference, { shrinkWhole: true }),
        }
      : undefined;
    const request = { ...body, styleReference };
    let lastEnvelope: ReturnType<typeof toPdpErrorResponse> | null = null;
    let lastStatus = 500;
    for (let attempt = 1; attempt <= MAX_ANALYZE_ATTEMPTS; attempt++) {
      try {
        // 조각낸 레퍼런스가 실린 `request` 를 보낸다(`body` 가 아니다).
        const result = await analyzeProduct(request, providers, { skipFirstImage: true });
        // 장부가 안 닫혀도 결과는 돌려준다. 여기서 던지면 아래 catch 가 성공한
        // 분석을 「분석 실패」로 바꾸고, 사용자는 다시 눌러 돈을 또 쓴다.
        /**
         * **그림이 없는 단계도 돈이 든다.** 크레딧은 0장이지만 글 모델 값은
         * 나갔다. 그동안 이 값이 장부에 안 실려, 분석만 반복하는 사용이
         * 원가 집계에서 $0 으로 보였다.
         */
        const usage = await settleAiUsage(reservation, true, 0, undefined, {
          model: "",
          billableImages: 0,
          llmUsd: readLlmMeter().usd,
        });
        return Response.json({ ok: true, result, usage });
      } catch (err) {
        lastEnvelope = toPdpErrorResponse(err);
        lastStatus = mapPdpErrorCodeToStatus(lastEnvelope.code);
        if (!(attempt < MAX_ANALYZE_ATTEMPTS && isTransientBlueprintFailure(lastEnvelope.code, lastEnvelope.detail))) break;
      }
    }
    // 실패해도 글 모델 값은 이미 나갔다. 낭비가 안 보이면 줄일 수도 없다.
    await finalizeAiUsage(reservation, false, 0, String(lastEnvelope?.code || "analyze_failed"), {
      model: "",
      billableImages: 0,
      llmUsd: readLlmMeter().usd,
    });
    return Response.json(lastEnvelope, { status: lastStatus });
  } catch (err) {
    await finalizeAiUsage(reservation, false, 0, "invalid_request");
    const envelope = toPdpErrorResponse(err);
    return Response.json(envelope, { status: mapPdpErrorCodeToStatus(envelope.code) });
  }
}
