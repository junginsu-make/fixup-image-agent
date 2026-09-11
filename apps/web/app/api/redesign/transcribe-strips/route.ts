import { transcribeStrips, transcribeModelInfo, humanizeProviderError, RedesignError } from "@fixup/redesign-core";
import { runLlmOperation } from "../../../../lib/generation/llm-operation";
import { generationFailureResponse, inputHash } from "../../../../lib/generation/run-store";
import { invokeRecordedLlm } from "../../../../lib/llm/recorded-call";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { boundedJson } from "../../../../lib/generation/request-body";
import { validateTranscriptionStrips } from "../../../../lib/redesign/validate-strips";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const body = await boundedJson(req) as Record<string, unknown>;
    await validateTranscriptionStrips(body?.strips);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const modelInfo=transcribeModelInfo(String(body?.provider||"openai"));
      const result = await runLlmOperation(req,auth.member.userId,{operation:"redesign_transcribe",identity:inputHash(body),models:[modelInfo.model],maxCalls:1,maxOutputTokens:modelInfo.maxOutputTokens},()=>transcribeStrips({
        strips: Array.isArray(body?.strips) ? body.strips : [],
        batchIndex: Number(body?.batchIndex ?? 0),
        batchCount: Number(body?.batchCount ?? 1),
        previousSectionHint: body?.previousSectionHint ? String(body.previousSectionHint) : undefined,
        provider: String(body?.provider || "openai"),
        openaiKey: resolveOpenaiKey(),
        googleKey: resolveGoogleKey(),
        signal: controller.signal,
        onProviderCall: invokeRecordedLlm,
      }));
      return Response.json(result);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const limited=generationFailureResponse(err);if(limited)return limited;
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeProviderError(err.message) : "전사 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
