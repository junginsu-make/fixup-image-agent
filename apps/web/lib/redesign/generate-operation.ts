import "server-only";
import { createHash } from "node:crypto";
import { generateSections, redesignGenerationModels, sizeForRatio, RedesignError, humanizeProviderError, type GenerateInputFile, type GenerateSectionsInput } from "@fixup/redesign-core";
import { buildSceneWithCharacterDirective, pickAngleForSection } from "@fixup/pdp-core";
import { authenticateApiMember } from "../membership/api";
import { boundedFormData } from "../generation/request-body";
import { generationFailureResponse } from "../generation/run-store";
import { runImageOperation } from "../generation/image-operation";
import { resolveOpenaiKey, resolveGoogleKey } from "../server-keys";
import { createRedesignImageGenerator, quoteRedesignFal, REDESIGN_FAL_MODEL } from "./image-generator";
import { directRedesignImagePrice, invokeRecordedRedesign } from "./recorded-provider";
import { loadCharacterView } from "../characters";
import { teamIdOf } from "../teams/store";

export async function durableRedesignGenerate(request: Request): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const form = await boundedFormData(request);
    const countValue = Number(form.get("count") || 1);
    const count = Number.isFinite(countValue) ? Math.max(1, Math.min(10, Math.trunc(countValue))) : 1;
    const ratio = String(form.get("ratio") || "9:16");
    const provider = String(form.get("model") || "openai") === "google" ? "google" : "openai";
    const models = redesignGenerationModels();
    let generateImage: GenerateSectionsInput["generateImage"];
    try { generateImage = createRedesignImageGenerator(); } catch { generateImage = undefined; }
    // Preserve the currently selected provider path. The ledger follows the
    // actual injected image generator, including the existing direct fallback.
    const drawingModel = generateImage ? REDESIGN_FAL_MODEL : provider === "google" ? models.imageGoogle : models.imageOpenAI;
    const price = generateImage ? quoteRedesignFal(sizeForRatio(ratio)) : directRedesignImagePrice({ provider, model: drawingModel, request: { quality: models.quality } });
    const files: GenerateInputFile[] = await Promise.all(form.getAll("files").filter((v): v is File => v instanceof File).map(async file => ({ name: file.name, type: file.type, buffer: Buffer.from(await file.arrayBuffer()) })));
    const fields = Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const result = await runImageOperation(request, auth.member.userId, {
      operation: "redesign_generate", units: Math.ceil(price * count / 50000),
      identity: { fields, drawingModel, price, files: files.map(f => ({ name: f.name, type: f.type, digest: createHash("sha256").update(f.buffer).digest("hex") })) },
      models: [provider === "google" ? models.analysisGoogle : models.analysisOpenAI, "text-embedding-3-small"],
      maximumImages: count, maximumImageCostMicrousd: price, maximumLlmCalls: 2, maximumLlmOutputTokens: provider === "google" ? 65536 : 128000,
    }, async () => {
      let character: GenerateSectionsInput["character"];
      const characterId = String(form.get("characterId") || "");
      if (characterId) {
        const view = await loadCharacterView(auth.member.userId, characterId, pickAngleForSection(""), await teamIdOf(auth.member.userId));
        if (view) character = { name: "character.png", mimeType: view.mimeType, buffer: Buffer.from(view.base64, "base64"),
          directive: buildSceneWithCharacterDirective({ identityPrompt: view.identityPrompt, hasStyleReference: files.length > 0 }) };
      }
      const value = await generateSections({ files, character, request: String(form.get("request") || ""), rolloutRequest: String(form.get("rolloutRequest") || ""),
        knowledgeText: String(form.get("knowledgeText") || ""), transcript: String(form.get("transcript") || ""), useKnowledge: String(form.get("useKnowledge") || "") === "true",
        knowledgeAccessAuthorized: true, model: provider, channel: String(form.get("channel") || "스마트스토어"), ratio, look: String(form.get("look") || "auto"),
        count, startSection: Number(form.get("startSection") || 1), generateImage, onProviderCall: invokeRecordedRedesign,
        openaiKey: resolveOpenaiKey(), googleKey: resolveGoogleKey(),
      });
      const images = value.project.sections.map(section => ({ base64: section.imageUrl.slice(section.imageUrl.indexOf(",") + 1), mimeType: section.mimeType }));
      return { value, images, success: images.length > 0 };
    });
    return Response.json(result);
  } catch (error) {
    const limited = generationFailureResponse(error);
    if (limited) return limited;
    return Response.json({ error: error instanceof RedesignError ? error.message : humanizeProviderError(error instanceof Error ? error.message : "이미지 생성 실패") }, { status: error instanceof RedesignError ? error.status : 500 });
  }
}
