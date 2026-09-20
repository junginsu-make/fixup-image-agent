import { z } from "zod";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS, MAX_STRATEGY_LENGTH, PAGE_CONTEXT_MAX_LENGTH, SELLER_BRIEF_MAX_LENGTH, maxBatchSizeFor } from "@fixup/pdp-core";
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
/*
  **깨진 그림은 예약 전에 되돌려 보낸다**(C-9 리뷰).

  `analyze` 스키마의 `mimeType` 은 그냥 문자열이었다. 그래서 `"x"` 한 글자면
  예약을 통과하고, 라우트가 sharp 로 최대 20MiB 를 다 간 뒤에야 코어의
  `normalizeMimeType` 이 `INVALID_IMAGE_PAYLOAD` 로 끝냈다. 그 코드는 **분석
  한도 면제**라, 값싼 실패를 천장(100회/시간)까지 반복할 수 있었다.

  기준은 코어와 **같다** — `normalizeMimeType` 은 `image/` 로 시작하는지만 보고,
  `sanitizeBase64Payload` 는 base64 글자만 있는지 본다. 새로 막히는 그림은 없다.
*/
const imageMime = text.regex(new RegExp(String.raw`^image/[a-z0-9.+-]+$`, "i"), "이미지 파일만 올릴 수 있습니다.");
const imagePayload = text.trim().min(1)
  .regex(new RegExp(String.raw`^(?:data:[^;]+;base64,)?[A-Za-z0-9+/\s]+=*$`), "이미지 데이터가 올바르지 않습니다.");

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
  // 앵커가 실물 사진인가, 우리가 만든 대표 이미지인가(U-03). 안 오면 실물로 본다.
  anchorKind: z.enum(["product-photo", "key-visual"]).optional(),
  // 인물 사진과 저장 캐릭터를 둘 다 골랐을 때 누구를 쓸 것인가(U-04).
  personSource: z.enum(["uploaded", "character"]).optional(),
  look: z.enum(IMAGE_LOOKS).optional(), userInstruction: text.optional(), pageContext: text.max(PAGE_CONTEXT_MAX_LENGTH).optional(),
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
  analyze: z.object({ ...common, imageBase64: imagePayload, mimeType: imageMime,
    modelImageBase64: text.optional(), modelImageMimeType: text.optional(),
    /*
      **기획과 이미지 생성이 같은 상한을 쓴다**(U-08).

      전에는 여기만 제한이 없었다. 같은 화면 칸인데 기획은 501자를 받고 이미지
      생성(`pageContext`)이 막아서, 구성안을 다 손본 뒤에야 400 을 만났다.
    */
    additionalInfo: text.max(PAGE_CONTEXT_MAX_LENGTH).optional(),
    // 화면이 쓰는 상한과 **같은 상수**다(U-08). 두 벌로 적으면 화면은 허용하는데
    // 서버가 막는 날이 온다 — 그때 뜨는 말은 「요청이 올바르지 않습니다」뿐이다.
    sellerBrief: z.object({
      audience: text.max(SELLER_BRIEF_MAX_LENGTH).optional(),
      problem: text.max(SELLER_BRIEF_MAX_LENGTH).optional(),
      features: text.max(SELLER_BRIEF_MAX_LENGTH).optional(),
      differentiator: text.max(SELLER_BRIEF_MAX_LENGTH).optional(),
      emphasis: text.max(SELLER_BRIEF_MAX_LENGTH).optional(),
    }).optional(),
    copyIntensity: z.enum(["plain", "normal", "strong", "max"]).optional(), gapPolicy: z.enum(["omit", "ask", "sample"]).optional(),
    styleReference: image.optional(), outputMode: z.enum(["editable", "full-image"]).optional(),
    // 「이 전략으로 구성 다시 만들기」가 보내는 고친 전략(U-11).
    // **화면도 같은 상수를 쓴다** — 화면이 모르면 긴 글을 붙여넣은 사용자가
    // 설명 없는 400 을 만난다.
    strategyDirective: text.max(MAX_STRATEGY_LENGTH).optional(),
    // 구성·문구 요청과 그림체도 기획이 본다(U-06). 길이는 장면 지시와 같게 둔다.
    planInstruction: text.max(MAX_STRATEGY_LENGTH).optional(),
    look: z.enum(IMAGE_LOOKS).optional(),
  }).passthrough(),
  plan: z.object({ ...common, text: text.trim().min(1), outputMode: z.enum(["editable", "full-image"]).optional(),
    copyIntensity: z.enum(["plain", "normal", "strong", "max"]).optional(), gapPolicy: z.enum(["omit", "ask", "sample"]).optional() }).passthrough(),
  keyVisual: z.object({ ...common, imageModel: model.optional(), brief: z.object({ offeringName: text.trim().min(1) }).passthrough(),
    blueprint: z.object({ sections: z.array(section).min(1) }).passthrough() }).passthrough(),
};

export function invalidPdpRequest(message = "요청 형식이 올바르지 않습니다.", status = 400) {
  return Response.json({ ok: false, code: "INVALID_REQUEST", message }, { status });
}

/** 본문이 상한을 넘었다. 읽다가 끊은 것이라 남은 바이트는 안 받는다. */
export class BodyLimitError extends Error {}

/**
 * 본문을 **상한까지만** 읽는다.
 *
 * `req.json()` 은 끝까지 읽는다. Content-Length 를 믿지도 않는다 — 스트림으로
 * 오면 그 값이 없거나 거짓일 수 있다. 그래서 세면서 읽고 넘으면 끊는다.
 */
export async function readBoundedBody(req: Request, limit = PDP_JSON_LIMIT): Promise<Buffer> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("본문이 없습니다.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new BodyLimitError(); }
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
    const bytes = await readBoundedBody(req);
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
    const bytes = await readBoundedBody(req);
    const parsed = schemas[kind].safeParse(JSON.parse(bytes.toString("utf8")));
    if (!parsed.success) return { ok: false, response: invalidPdpRequest() };
    return { ok: true, body: parsed.data as T };
  } catch (error) {
    return { ok: false, response: bodyError(error) };
  }
}
