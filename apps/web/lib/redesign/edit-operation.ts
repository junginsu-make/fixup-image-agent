import "server-only";
import { editSection, editSectionModelInfo, RedesignError, humanizeEditError, type EditSectionInput } from "@fixup/redesign-core";
import { authenticateApiMember } from "../membership/api";
import { boundedJson } from "../generation/request-body";
import { runImageOperation } from "../generation/image-operation";
import { generationFailureResponse, inputHash } from "../generation/run-store";
import { resolveGoogleKey, resolveOpenaiKey } from "../server-keys";
import { directRedesignImagePrice, invokeRecordedRedesign } from "./recorded-provider";

export async function durableRedesignEdit(request: Request): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const body = await boundedJson(request) as EditSectionInput;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json");
    const info = editSectionModelInfo(body.model ?? "openai");
    const price = directRedesignImagePrice({ ...info, request: info });
    const result = await runImageOperation(request, auth.member.userId, {
      operation: "redesign_edit", units: Math.ceil(price / 50000), identity: { bodyHash: inputHash(body), model: info },
      models: [info.model], maximumImages: 1, maximumImageCostMicrousd: price, maximumLlmCalls: 0,
    }, async () => {
      const value = await editSection({ ...body, openaiKey: resolveOpenaiKey(), googleKey: resolveGoogleKey(), onProviderCall: invokeRecordedRedesign });
      return { value, images: [{ base64: value.imageUrl.slice(value.imageUrl.indexOf(",") + 1), mimeType: value.mimeType }], success: true };
    });
    return Response.json(result);
  } catch (error) {
    const limited = generationFailureResponse(error);
    if (limited) return limited;
    return Response.json({ error: error instanceof RedesignError ? error.message : humanizeEditError(error instanceof Error ? error.message : "섹션 수정 실패") }, { status: error instanceof RedesignError ? error.status : 500 });
  }
}
