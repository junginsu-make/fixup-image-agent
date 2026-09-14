import "server-only";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS, generateKeyVisual, textPlanDepsFrom, toPdpErrorResponse, mapPdpErrorCodeToStatus, maxBatchSizeFor,
  pickAngleForSection, pageInputsFromWire, buildSectionImageOptions, generateSectionImage } from "@fixup/pdp-core";
import type { KeyVisualRequest } from "@fixup/pdp-core";
import { authenticateApiMember } from "../membership/api";
import { runImageOperation } from "../generation/image-operation";
import { boundedJson } from "../generation/request-body";
import { generationFailureResponse, inputHash } from "../generation/run-store";
import { createPdpProviders } from "./providers";
import { quotePdpImage } from "./fal";
import { withSlicedStyleReference } from "./slice-image";
import { loadCharacterView } from "../characters";
import { teamIdOf } from "../teams/store";
import { rejectIfUnverified } from "../evidence-gate";
import { rememberGenerationInput } from "../generation/prepared-input";
import type { PdpImagesRequestBody } from "../../app/api/pdp/images/route";
import type { BatchRequest } from "../../app/api/pdp/images/batch/route";

export async function durableKeyVisual(request: Request): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const body = await boundedJson(request) as KeyVisualRequest;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json");
    const model = body.imageModel ?? DEFAULT_IMAGE_MODEL;
    if (!IMAGE_MODELS.some(m => m.id === model)) throw new Error("invalid_image_model");
    const price = quotePdpImage(model, { prompt: "", systemPrompt: "", aspectRatio: body.aspectRatio, references: [] });
    const result = await runImageOperation(request, auth.member.userId, {
      operation: "pdp_image", identity: { mode: "key_visual", bodyHash: inputHash(body) }, units: Math.ceil(price / 50000),
      models: [model], maximumImages: 1, maximumImageCostMicrousd: price, maximumLlmCalls: 0,
    }, async () => {
      const value = await generateKeyVisual(body, textPlanDepsFrom(createPdpProviders()));
      return { value: { ok: true, ...value }, images: [{ base64: value.imageBase64, mimeType: value.mimeType }], success: true };
    });
    return Response.json(result);
  } catch (error) {
    const limited = generationFailureResponse(error);
    if (limited) return limited;
    const failure = toPdpErrorResponse(error);
    return Response.json(failure, { status: mapPdpErrorCodeToStatus(failure.code) });
  }
}

export async function durablePdpSections(request: Request, mode: "single" | "batch"): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const body = await boundedJson(request) as PdpImagesRequestBody & Partial<BatchRequest>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json");
    const model = body.page?.imageModel ?? (mode === "single" ? body.options?.imageModel : undefined) ?? DEFAULT_IMAGE_MODEL;
    if (!IMAGE_MODELS.some(m => m.id === model)) throw new Error("invalid_image_model");
    const sections = mode === "single" ? [body.section] : Array.isArray(body.sections) ? body.sections.slice(0, maxBatchSizeFor(model)) : [];
    if (!sections.length || sections.some(s => !s || typeof s !== "object")) return Response.json({ ok: false, code: "INVALID_REQUEST", message: "생성할 섹션 형식이 올바르지 않습니다." }, { status: 400 });
    const gate = rejectIfUnverified(sections);
    if (gate) return gate;
    const quoteInput = { prompt: "", systemPrompt: "", aspectRatio: body.aspectRatio, references: [] };
    const price = Math.max(quotePdpImage(model, quoteInput), quotePdpImage(model, { ...quoteInput, references: [{ kind: "anchor", base64: "", mimeType: "image/png" }] }));
    const reply = await runImageOperation<{ status: number; body: Record<string, unknown> }>(request, auth.member.userId, {
      operation: "pdp_image", identity: { mode, model, bodyHash: inputHash(body) }, units: Math.ceil(price * sections.length / 50000),
      models: [process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5", process.env.OPENAI_VISION_MODEL?.trim() || process.env.OPENAI_DRAFT_MODEL?.trim() || "gpt-5.6-sol"],
      // Existing core: up to three image/ref passes, each with two known-error retries.
      maximumImages: sections.length * 9, maximumImageCostMicrousd: price, maximumLlmCalls: sections.length * 12,
    }, async () => {
      const providers = createPdpProviders();
      const prepared = await rememberGenerationInput("pdp-sections", async () => {
      const characterByAngle = new Map<string, Awaited<ReturnType<typeof loadCharacterView>>>();
      if (body.characterId) {
        const team = await teamIdOf(auth.member.userId);
        for (const angle of new Set(sections.map(s => pickAngleForSection(s.layout_notes ?? ""))))
          characterByAngle.set(angle, await loadCharacterView(auth.member.userId, body.characterId, angle, team));
      }
      const page = pageInputsFromWire(await withSlicedStyleReference({ ...body.page, imageModel: model }));
      return { page, characters: [...characterByAngle.entries()] };
      });
      const page=prepared.page;
      const characterByAngle=new Map(prepared.characters);
      // Keep the existing batch concurrency; logical request hashes isolate its responses.
      const outcomes = await Promise.allSettled(sections.map((section, position) => generateSectionImage({
        originalImageBase64: body.originalImageBase64, section, aspectRatio: body.aspectRatio, desiredTone: body.desiredTone,
        options: buildSectionImageOptions(page, {
          section, index: mode === "single" ? body.sectionIndex ?? 0 : body.sectionIndexes?.[position] ?? position,
          options: mode === "single" ? body.options : body.optionsBySection?.[section.section_id],
          emphasisWords: mode === "single" ? body.emphasisWords ?? body.options?.emphasisWords : body.emphasisWordsList?.[position] ?? body.emphasisWordsBySection?.[section.section_id],
          characterReference: characterByAngle.get(pickAngleForSection(section.layout_notes ?? "")) ?? undefined,
        }),
      }, providers)));
      const images = outcomes.flatMap(o => o.status === "fulfilled" ? [{ base64: o.value.imageBase64, mimeType: o.value.mimeType }] : []);
      if (mode === "single") {
        const outcome = outcomes[0];
        if (outcome.status === "fulfilled") return { value: { status: 200, body: { ok: true, imageBase64: outcome.value.imageBase64, mimeType: outcome.value.mimeType, qa: outcome.value.qa } }, images, success: true };
        const failure = toPdpErrorResponse(outcome.reason);
        return { value: { status: mapPdpErrorCodeToStatus(failure.code), body: { ...failure } }, images, success: false };
      }
      const results = outcomes.map((outcome, index) => {
        if (outcome.status === "fulfilled") return { sectionId: sections[index].section_id, ok: true as const, ...outcome.value };
        const failure = toPdpErrorResponse(outcome.reason);
        return { sectionId: sections[index].section_id, ok: false as const, code: failure.code, message: failure.message, generatedImages: failure.billableImages ?? 0 };
      });
      return { value: { status: 200, body: { ok: true, model, requested: sections.length, succeeded: images.length, results } }, images, success: images.length > 0 };
    });
    return Response.json(reply.body, { status: reply.status });
  } catch (error) {
    const limited = generationFailureResponse(error);
    if (limited) return limited;
    const failure = toPdpErrorResponse(error);
    return Response.json(failure, { status: mapPdpErrorCodeToStatus(failure.code) });
  }
}
