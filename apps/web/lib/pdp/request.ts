import { z } from "zod";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS, MAX_STRATEGY_LENGTH, maxBatchSizeFor } from "@fixup/pdp-core";
import type { ImageModelId } from "@fixup/pdp-core";
import { IMAGE_LOOKS } from "@fixup/shared";
import { authenticateApiMember } from "../membership/api";

// 기존 decoded 업로드 예산 20MiB + base64 팽창 + JSON 메타데이터 여유.
export const PDP_JSON_LIMIT = Math.ceil(20 * 1024 * 1024 * 4 / 3) + 1024 * 1024;
const text = z.string();
const model = text.refine((value) => IMAGE_MODELS.some((entry) => entry.id === value), "지원하지 않는 이미지 모델입니다.")
  .transform((value) => value as ImageModelId);
const ratio = z.enum(["1:1", "3:4", "4:3", "9:16", "16:9"]);
const image = z.object({ imageBase64: text.trim().min(1), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]) }).passthrough();
const intents = z.object({ anchor: text.optional(), person: text.optional(), style: text.optional() });
const options = z.object({
  imageModel: model.optional(), style: z.enum(["studio", "lifestyle", "outdoor"]).optional(),
  modelCountry: z.enum(["korea", "japan", "usa", "france", "germany", "africa"]).optional(),
  modelGender: z.enum(["female", "male"]).optional(),
  modelAgeRange: z.enum(["teen", "20s", "30s", "40s", "50s_plus"]).optional(),
  guidePriorityMode: z.enum(["guide-first", "style-first"]).optional(),
  outputMode: z.enum(["editable", "full-image"]).optional(), withModel: z.boolean().optional(),
  peopleMode: z.enum(["auto", "none"]).optional(),
  emphasisWords: z.array(text).optional(),
}).passthrough();
const target = z.discriminatedUnion("slot", [
  z.object({ slot: z.enum(["headline", "subheadline", "trust_or_objection_line", "CTA", "prompt_ko"]) }),
  z.object({ slot: z.literal("bullet"), index: z.number().int().nonnegative() }),
]);
const section = z.object({
  section_id: text.trim().min(1), prompt_en: text.trim().min(1),
  headline: text.optional(), subheadline: text.optional(), bullets: z.array(text).default([]),
  prompt_ko: text.optional(), layout_notes: text.optional(),
  evidenceVersion: z.literal(1).optional(),
  evidence: z.array(z.object({ target, value: text, kind: z.enum(["quoted", "rhetoric", "sample", "user", "ask"]),
    quote: text.optional(), note: text.optional(), acknowledgedAt: text.optional() })).optional(),
}).passthrough();
const page = z.object({ imageModel: model.optional(), styleReference: image.optional(), referenceModel: image.optional(),
  referenceModelUsage: z.enum(["hero-only", "all-sections"]).nullable().optional(),
  preserveProduct: z.boolean().optional(), outputMode: z.enum(["editable", "full-image"]).optional(),
  look: z.enum(IMAGE_LOOKS).optional(), userInstruction: text.optional(), pageContext: text.max(500).optional(),
  attachmentIntents: intents.optional() }).passthrough();
const common = {
  // 어느 작업의 것인가. 결과를 되찾을 때 이 값으로 묶는다(설계 §8).
  documentId: text.max(120).optional(), revision: z.number().int().nonnegative().optional(),
  aspectRatio: ratio.optional(), desiredTone: text.optional(),
  characterId: text.optional(), characterAngles: z.array(text).optional(),
  page: page.optional(), options: options.optional(), sectionIndex: z.number().int().nonnegative().optional(),
  sectionIndexes: z.array(z.number().int().nonnegative()).optional(),
  emphasisWords: z.array(text).optional(), emphasisWordsList: z.array(z.array(text)).optional(),
  emphasisWordsBySection: z.record(text, z.array(text)).optional(),
  optionsBySection: z.record(text, options).optional(),
};
const schemas = {
  redesignEdit: z.object({ model: z.enum(["openai", "google"]).optional(),
    imageUrl: text.regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/), request: text.trim().min(1),
    section: z.record(text, z.unknown()).optional(), project: z.record(text, z.unknown()).optional(),
  }).passthrough(),
  single: z.object({ ...common, originalImageBase64: text.trim().min(1), section }).passthrough(),
  batch: z.object({ ...common, originalImageBase64: text.trim().min(1), sections: z.array(section).min(1) }).passthrough()
    .refine((body) => body.sections.length <= maxBatchSizeFor(body.page?.imageModel ?? DEFAULT_IMAGE_MODEL), "한 번에 생성할 수 있는 장수를 초과했습니다."),
  analyze: z.object({ ...common, imageBase64: text.trim().min(1), mimeType: text,
    modelImageBase64: text.optional(), modelImageMimeType: text.optional(), additionalInfo: text.optional(),
    sellerBrief: z.object({ audience: text.max(500).optional(), problem: text.max(500).optional(), features: text.max(500).optional(), differentiator: text.max(500).optional(), emphasis: text.max(500).optional() }).optional(),
    copyIntensity: z.enum(["plain", "normal", "strong", "max"]).optional(), gapPolicy: z.enum(["omit", "ask", "sample"]).optional(),
    styleReference: image.optional(), outputMode: z.enum(["editable", "full-image"]).optional(),
    // 「이 전략으로 구성 다시 만들기」가 보내는 고친 전략(U-11).
    // **화면도 같은 상수를 쓴다** — 화면이 모르면 긴 글을 붙여넣은 사용자가
    // 설명 없는 400 을 만난다.
    strategyDirective: text.max(MAX_STRATEGY_LENGTH).optional(),
  }).passthrough(),
  plan: z.object({ ...common, text: text.trim().min(1), outputMode: z.enum(["editable", "full-image"]).optional(),
    copyIntensity: z.enum(["plain", "normal", "strong", "max"]).optional(), gapPolicy: z.enum(["omit", "ask", "sample"]).optional() }).passthrough(),
  keyVisual: z.object({ ...common, imageModel: model.optional(), brief: z.object({ offeringName: text.trim().min(1) }).passthrough(),
    blueprint: z.object({ sections: z.array(section).min(1) }).passthrough() }).passthrough(),
};

export function invalidPdpRequest(message = "요청 형식이 올바르지 않습니다.", status = 400) {
  return Response.json({ ok: false, code: "INVALID_REQUEST", message }, { status });
}

class BodyLimitError extends Error {}
async function readBodyBytes(req: Request): Promise<Buffer> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("본문이 없습니다.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > PDP_JSON_LIMIT) { await reader.cancel(); throw new BodyLimitError(); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

function bodyError(error: unknown) {
  return error instanceof BodyLimitError ? invalidPdpRequest("요청 이미지 용량이 너무 큽니다.", 413) : invalidPdpRequest();
}

export async function readRedesignForm(req: Request): Promise<{ ok: true; form: FormData } | { ok: false; response: Response }> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth;
  try {
    const bytes = await readBodyBytes(req);
    const form = await new Response(Uint8Array.from(bytes), { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
    const count = Number(form.get("count") ?? 1);
    const start = Number(form.get("startSection") ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 10 || !Number.isInteger(start) || start < 1 ||
      !form.getAll("files").some((file) => file instanceof File && file.size > 0) ||
      (form.has("model") && !["openai", "google"].includes(String(form.get("model")))) ||
      (form.has("ratio") && !ratio.safeParse(form.get("ratio")).success) ||
      (form.has("look") && !z.enum(IMAGE_LOOKS).safeParse(form.get("look")).success)) {
      return { ok: false, response: invalidPdpRequest() };
    }
    return { ok: true, form };
  } catch (error) { return { ok: false, response: bodyError(error) }; }
}

export async function readPdpRequest<T>(req: Request, kind: keyof typeof schemas): Promise<
  { ok: true; body: T } | { ok: false; response: Response }
> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth;
  try {
    const bytes = await readBodyBytes(req);
    const parsed = schemas[kind].safeParse(JSON.parse(bytes.toString("utf8")));
    if (!parsed.success) return { ok: false, response: invalidPdpRequest() };
    return { ok: true, body: parsed.data as T };
  } catch (error) {
    return { ok: false, response: bodyError(error) };
  }
}
