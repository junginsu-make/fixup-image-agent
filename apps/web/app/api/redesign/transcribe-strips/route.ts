import { transcribeStrips, humanizeProviderError, RedesignError } from "@fixup/redesign-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../lib/membership/credit-ledger";
import { readLlmMeter, recordLlmUsage, withLlmMeter } from "../../../../lib/llm/meter";
import { BodyLimitError, readBoundedBody } from "../../../../lib/pdp/request";
import { TRANSCRIBE_JSON_LIMIT, TRANSCRIBE_MAX_MB } from "./limits";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * **전사가 장부 밖에 있었다**(F-7-9).
 *
 * 이 라우트는 로그인만 보고 `await req.json()` 한 줄로 본문을 받았다. 예약도,
 * 계량기도, 본문 상한도 없었다 — 같은 페이지를 천 번 전사해도 막는 것이
 * 아무것도 없고, 그 돈은 운영 원가에서 **$0 으로** 보였다.
 *
 * 설계 §7.2: 「기획·레퍼런스 분석·**전사** 성공/실패를 LLM meter 에 연결한다.
 * 이미지 크레딧 0 이어도 원가 기록은 남긴다.」
 * 설계 §7.2: 「현재 시간당 분석 제한 설정은 재사용하고 레퍼런스 분석·**전사**
 * 에도 명시된 LLM 작업 한도를 적용한다.」
 *
 * 값이 작지 않다. 화면이 원본을 스트립 마흔 장까지 자르고 배치당 여덟 장씩
 * 보내므로, 한 페이지를 전사하면 **호출이 다섯 번까지** 간다.
 */
export async function POST(req: Request) {
  return withLlmMeter(() => transcribe(req));
}

async function transcribe(req: Request) {
  /*
    **인증이 먼저다**(X-04).

    로그인도 안 한 요청의 몸을 읽어 메모리에 쌓을 까닭이 없다. 레퍼런스 등록
    길이 이미 **인증 → 본문 → 예약** 순이다(`pdp/style-references/route.ts`) —
    전사만 본문이 먼저였다.

    `reserveAiUsage` 도 안에서 인증하지만 그것은 본문을 읽은 **뒤**다.
  */
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  /*
    **그다음 문지기다**(C-9 와 같은 판단).

    깨진 입력·너무 큰 본문은 모델을 부르기 전에 끝난다. 예약을 먼저 하면
    값싼 실패로 시간당 한도를 태울 수 있다.
  */
  let body: Record<string, unknown>;
  try {
    const bytes = await readBoundedBody(req, TRANSCRIBE_JSON_LIMIT);
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return error instanceof BodyLimitError
      ? Response.json(
          { error: `전사 요청이 너무 큽니다. 한 번에 ${TRANSCRIBE_MAX_MB}MB 이하로 보내 주세요.` },
          { status: 413 },
        )
      : Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  /*
    **크레딧은 0 이다.** 새로 그리는 것이 없다. 예약을 거는 이유는 차감이
    아니라 **횟수**다 — 칸은 기획(`pdp_analyze`)과 나눠 쓴다. 전사 한 번이
    시간당 열 번짜리 칸의 절반을 먹으면 그날 기획을 못 한다
    (`lib/membership/hourly-limit.ts`).
  */
  // 넷째 인자가 없으면 크레딧 장부로 옮긴 회원이 무조건 거절된다(2026-09-23 운영).
  // 그리는 것이 없으니 빈 목록이다.
  const reservation = await reserveAiUsage(req, "redesign_transcribe", 0, freeCreditPlan("redesign:transcribe"));
  if (!reservation.ok) return reservation.response;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const result = await transcribeStrips({
      strips: Array.isArray(body?.strips) ? (body.strips as never) : [],
      batchIndex: Number(body?.batchIndex ?? 0),
      batchCount: Number(body?.batchCount ?? 1),
      previousSectionHint: body?.previousSectionHint ? String(body.previousSectionHint) : undefined,
      provider: String(body?.provider || "openai"),
      openaiKey: resolveOpenaiKey(),
      googleKey: resolveGoogleKey(),
      signal: controller.signal,
      // 제공자가 적어 준 토큰이 여기로 온다. 계량기가 감싸고 있어야 갈 곳이 있다.
      onUsage: (usage) => recordLlmUsage(usage.model, usage.inputTokens, usage.outputTokens),
    });
    const usage = await settleAiUsage(reservation, true, 0, undefined, {
      model: "",
      billableImages: 0,
      llmUsd: readLlmMeter().usd,
    });
    return Response.json({ ...result, usage });
  } catch (err) {
    /*
      **실패해도 값은 이미 나갔다.** 모델이 돌다가 끊긴 경우가 그렇다. 여기서
      안 남기면 그 요청은 장부에서 0원으로 보인다(설계 §7.2 의 「성공/실패」).
    */
    await settleAiUsage(
      reservation,
      false,
      0,
      err instanceof RedesignError ? `transcribe_${err.status}` : "transcribe_failed",
      { model: "", billableImages: 0, llmUsd: readLlmMeter().usd },
    );
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeProviderError(err.message) : "전사 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}
