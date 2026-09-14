import "server-only";
import { analyzeProduct, planFromText, toPdpErrorResponse, mapPdpErrorCodeToStatus } from "@fixup/pdp-core";
import type { PdpAnalyzeRequest, TextPlanRequest, CopyIntensity, GapPolicy } from "@fixup/pdp-core";
import { isExecutionControl } from "@fixup/shared";
import { authenticateApiMember } from "../membership/api";
import { runLlmOperation } from "../generation/llm-operation";
import { generationFailureResponse, inputHash } from "../generation/run-store";
import { boundedJson } from "../generation/request-body";
import { createPdpProviders } from "./providers";
import { sliceTallReference } from "./slice-image";
import { suggestStyleReference } from "../style-reference";

type Envelope = { status: number; payload: Record<string, unknown> };
export async function durablePdpPlanning(request: Request, mode: "analyze" | "text"): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const body = await boundedJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json");
    const result = await runLlmOperation<Envelope>(request, auth.member.userId, {
      operation: "pdp_analyze", identity: { mode, bodyHash: inputHash(body) },
      models: [process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5", process.env.OPENAI_VISION_MODEL?.trim() || process.env.OPENAI_DRAFT_MODEL?.trim() || "gpt-5.6-sol"],
      // Text planning: brief + blueprint/review (initial + two revisions),
      // two route attempts, two providers, plus an optional style pick.
      maxCalls: mode === "text" ? 30 : 20, maxOutputTokens: 16384,
      isSuccess: value => value.payload.ok === true,
    }, async () => {
      const providers = createPdpProviders();
      const analyzeBody = body as PdpAnalyzeRequest;
      const prepared = mode === "analyze" && analyzeBody.styleReference
        ? { ...analyzeBody, styleReference: { ...analyzeBody.styleReference, slices: await sliceTallReference(analyzeBody.styleReference, { shrinkWhole: true }) } }
        : analyzeBody;
      const textBody = body as TextPlanRequest;
      const normalizedText = {
        ...textBody,
        copyIntensity: (["plain", "normal", "strong", "max"].includes(textBody.copyIntensity ?? "") ? textBody.copyIntensity : "normal") as CopyIntensity,
        gapPolicy: (["omit", "ask", "sample"].includes(textBody.gapPolicy ?? "") ? textBody.gapPolicy : "ask") as GapPolicy,
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (mode === "analyze") {
            const result = await analyzeProduct(prepared, providers, { skipFirstImage: true });
            return { status: 200, payload: { ok: true, result } };
          }
          const result = await planFromText(normalizedText, providers);
          const suggestion = await suggestStyleReference(auth.member.userId, result.brief);
          return { status: 200, payload: { ok: true, result: suggestion.reference ? {
            ...result, styleReference: {
              id: suggestion.reference.id, name: suggestion.reference.name, description: suggestion.reference.description,
              imageBase64: suggestion.reference.imageBase64, mimeType: suggestion.reference.mimeType, reason: suggestion.reason,
            },
          } : result } };
        } catch (error) {
          if (isExecutionControl(error)) throw error;
          const failure = toPdpErrorResponse(error);
          if (attempt === 0 && String(failure.code) === "INVALID_REQUEST" && /prompt_en|no sections|section/i.test(failure.detail ?? "")) continue;
          return { status: mapPdpErrorCodeToStatus(failure.code), payload: { ...failure } };
        }
      }
      throw new Error("planning_attempts_exhausted");
    });
    return Response.json(result.payload, { status: result.status });
  } catch (error) {
    const limited = generationFailureResponse(error);
    if (limited) return limited;
    const failure = toPdpErrorResponse(error);
    return Response.json(failure, { status: mapPdpErrorCodeToStatus(failure.code) });
  }
}
