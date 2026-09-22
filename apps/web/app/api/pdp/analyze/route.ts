import { freeCreditPlan } from "../../../../lib/membership/credit-ledger";
import { readLlmMeter, withLlmMeter } from "../../../../lib/llm/meter";
import { analyzeProduct, toPdpErrorResponse, mapPdpErrorCodeToStatus } from "@fixup/pdp-core";
import type { PdpAnalyzeRequest } from "@fixup/pdp-core";
import { createPdpProviders } from "../../../../lib/pdp/providers";
import { sliceTallReference } from "../../../../lib/pdp/slice-image";
import { reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { readPdpRequest } from "../../../../lib/pdp/request";
import { clearPlanStage, markPlanStage } from "../../../../lib/pdp/plan-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/*
  **다시 묻는 일은 코어가 한다**(D-3).

  여기에는 「`INVALID_REQUEST` 이고 detail 에 section 이 있으면 다시 부른다」는
  고리가 있었다. 그런데 분석 경로는 그 코드를 던지는 자리가 없다 — 섹션이 비면
  `AI_RESPONSE_INVALID` 다. **한 번도 안 걸렸다.** 있는 줄 알았던 그물이 없었다.

  지금은 `retryOperation` 이 그 코드를 두 번까지 다시 묻는다
  (`pdp.retry-policy`). 여기에 또 걸면 한 요청에 모델을 여섯 번 부른다.
*/

export async function POST(req: Request) {
  // 이 요청에서 글 모델에 쓴 돈을 잰다. 안쪽 어디서 부르든 여기로 모인다.
  return withLlmMeter(() => analyze(req));
}

async function analyze(req: Request) {
  const parsed = await readPdpRequest<PdpAnalyzeRequest>(req, "analyze");
  if (!parsed.ok) return parsed.response;
  // 그림이 없으므로 0크레딧이다. 그래도 예약은 거친다 — 정지 계정과 잔액
  // 부족은 0장짜리 요청도 막아야 한다.
  const reservation = await reserveAiUsage(req, "pdp_analyze", 0, freeCreditPlan("pdp:analyze"));
  if (!reservation.ok) return reservation.response;
  try {
    const body = parsed.body;
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

    // 조각낸 레퍼런스가 실린 `request` 를 보낸다(`body` 가 아니다).
    /*
      **기획이 어디쯤인지 적어 둔다**(2026-09-22 사용자 요청).

      사진 기획은 4분 가까이 걸린다. 화면은 그동안 한 줄로 버텼고, 사용자는
      「막연하게 너무 지루하게 기다리기만 한다」고 했다.

      **시간으로 세지 않는다.** 모델이 늦으면 아직 구성안을 짜는 중인데 화면이
      「검수 중」이라고 말하게 된다. 코어가 실제로 넘어갈 때만 여기에 찍고,
      화면은 `analyze/progress` 로 물어본다.

      번호는 화면이 만들어 보낸다. 안 보내면 아무 일도 안 한다 — 진행 표시가
      없을 뿐 기획은 그대로 돈다.
    */
    // 코어 요청 모양에는 없는 칸이다. 기획의 입력이 아니라 **진행을 물어볼
    // 번호**라, 모양은 `isPlanProgressId` 가 가린다.
    const progressId = String((body as { planProgressId?: unknown }).planProgressId ?? "");

    const analyzed = await analyzeProduct(request, providers, {
      skipFirstImage: true,
      onStage: (stage) => markPlanStage(progressId, reservation.userId, stage),
    });
    const result = { ...analyzed, planningExecutions: providers.llm.executions?.filter((entry) => entry.purpose === "planning") };
    /**
     * 장부가 안 닫혀도 결과는 돌려준다. 여기서 던지면 아래 catch 가 성공한
     * 분석을 「분석 실패」로 바꾸고, 사용자는 다시 눌러 돈을 또 쓴다.
     *
     * **그것을 지키는 것은 이 자리가 아니라 `settleAiUsage` 다** — 그 함수가
     * RPC 오류를 삼킨다. `finalizeAiUsage` 로 바꾸는 순간 성공한 분석이
     * 500 이 된다.
     *
     * **그림이 없는 단계도 돈이 든다.** 크레딧은 0장이지만 글 모델 값은
     * 나갔다. 그동안 이 값이 장부에 안 실려, 분석만 반복하는 사용이 원가
     * 집계에서 $0 으로 보였다.
     */
    const usage = await settleAiUsage(reservation, true, 0, undefined, {
      model: "",
      billableImages: 0,
      llmUsd: readLlmMeter().usd,
    });
    clearPlanStage(progressId);
    return Response.json({ ok: true, result, usage });
  } catch (err) {
    /*
      **무슨 코드로 닫느냐가 한도를 가른다**(C-9).

      여기는 그동안 `"invalid_request"` 한 줄로 닫았다. 그런데 이 자리에 오는
      것은 요청 모양 문제가 아니다 — 요청 모양은 `readPdpRequest` 가 예약
      **전에** 되돌려 보낸다. 실제로 오는 것은 키가 없거나(`AI_KEY_MISSING`)
      레퍼런스를 자르다 터진 경우다.

      SQL 은 이 코드를 보고 분석 한도를 먹일지 정한다(`pdp.analysis-quota`).
      뭉뚱그려 적으면 공급자 장애가 사용자 한도를 먹는다.
    */
    // 실패해도 들고 있을 까닭이 없다. 화면은 응답으로 실패를 안다.
    clearPlanStage(String((parsed.body as { planProgressId?: unknown }).planProgressId ?? ""));
    const envelope = toPdpErrorResponse(err);
    // 실패해도 글 모델 값은 이미 나갔다. 낭비가 안 보이면 줄일 수도 없다.
    await settleAiUsage(reservation, false, 0, String(envelope.code || "analyze_failed"), {
      model: "",
      billableImages: 0,
      llmUsd: readLlmMeter().usd,
    });
    return Response.json(envelope, { status: mapPdpErrorCodeToStatus(envelope.code) });
  }
}
