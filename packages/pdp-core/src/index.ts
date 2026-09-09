import { PdpController } from "./pdp.controller";
import { PdpService, PdpServiceError, toPdpErrorResponse } from "./pdp.service";
import type {
  PdpAnalyzeRequest,
  PdpAnalyzeSuccessResponse,
  PdpErrorCode,
  PdpGenerateImageRequest,
  ImageGenOptionsInput,
  PdpGenerateImageSuccessResponse,
  PdpValidateApiKeySuccessResponse,
  QaDefect
} from "./types";

export { PdpController, PdpService, PdpServiceError, toPdpErrorResponse };
export { isBlockingDefect } from "./pdp.qa";
import type { PdpLlm } from "./pdp.llm";
export {
  buildFalPayload,
  chunkForModel,
  generateImageViaFal,
  maxBatchSizeFor,
  resolveEndpoint,
  type ImageGenerator,
  type ImageProviderInput,
} from "./pdp.image-provider";
export { buildImageJson, buildImageSystemPrompt, type ImagePromptOptions } from "./pdp.image-prompt";
export { defaultPreserveProduct, shouldSendAnchor } from "./pdp.product-anchor";
export { Type, type PdpLlm, type PdpLlmImage, type PdpLlmRequest, type PdpLlmResponse } from "./pdp.llm";
export {
  buildSectionImageOptions,
  pageInputsFromWire,
  usesUploadedPerson,
  type PageImageInputs,
  type PageImageWire,
  type SectionImageTarget,
} from "./pdp.image-options";
export { MAX_UPLOAD_BYTES, base64Bytes, planUploadBatches } from "./pdp.upload-budget";
export {
  CHARACTER_ANGLES,
  angleDirective,
  migrateAngle,
  DEFAULT_EXTRA_ANGLES,
  buildCandidatePrompt,
  buildSceneWithCharacterDirective,
  buildTurnaroundPrompt,
  pickAngleForSection,
  selectCharacterModel,
  type CharacterAngle,
  type CharacterAngleInfo,
  type CharacterKind,
  type CharacterLook,
  type CharacterReferenceRole,
} from "./pdp.character";
export {
  MIN_STYLE_SIMILARITY,
  analyzeStyleImage,
  buildStyleAnalysisPrompt,
  buildStyleQuery,
  describeStyleForPrompt,
  normalizeStyleAnalysis,
  pickStyleReference,
  type StyleAnalysis,
  type StyleImageAnalyzer,
  type StyleReferenceMatch,
} from "./pdp.style-reference";
export {
  LLM_PICK_THRESHOLD,
  MAX_PICK_CANDIDATES,
  buildStylePickPrompt,
  normalizeStylePick,
  pickStyleWithLlm,
  resolvePickedReference,
  type StylePick,
  type StylePicker,
} from "./pdp.style-picker";
export {
  REVIEW_CRITERIA,
  summarizeReview,
  type BlueprintReview,
  type ReviewCriterion,
  type ReviewItem,
  type ReviewRating,
  type ReviewSummary,
} from "./pdp.review";
export {
  PRODUCT_GROUNDING_RULES,
  PRODUCT_READING_RULES,
  isProductReadingUsable,
  normalizeProductReading,
  type ProductReading,
} from "./pdp.product-reading";
export {
  buildSellerBriefPrompt,
  hasSellerBrief,
  normalizeSellerBrief,
  type SellerBrief,
} from "./pdp.seller-brief";
export {
  readCopyTarget,
  sameTarget,
  spliceBullet,
  targetKey,
  writeCopyTarget,
} from "./pdp.copy-target";
export {
  containsFactualMarker,
  scanBannedClaims,
  type BannedClaimCategory,
} from "./pdp.claim-policy";
export {
  acknowledgeAll,
  applyUserEdit,
  collectUnverified,
  findUncoveredFactTargets,
  resolveStructureFailures,
  removeTarget,
  validateEvidenceBinding,
  verifyEvidenceStructure,
  type BindingState,
  type StructureFailure,
  type StructureFailureReason,
  type UnverifiedItem,
} from "./pdp.evidence";
export { gapPolicyRules, intensityRules } from "./pdp.copy-intensity";
export {
  generateKeyVisual,
  planFromText,
  buildBriefPrompt,
  buildKeyVisualPrompt,
  buildTextBlueprintPrompt,
  mergeArtDirection,
  normalizeBrief,
  normalizeTextBlueprint,
  type TextPlanDeps,
} from "./pdp.text-plan";
export * from "./types";

const controller = new PdpController();

/**
 * Maps a PdpErrorCode to the HTTP status used by the original Next.js
 * `app/api/pdp/analyze` and `app/api/pdp/images` route handlers.
 */
export function mapPdpErrorCodeToStatus(code?: PdpErrorCode | string): number {
  switch (code) {
    case "INVALID_IMAGE_PAYLOAD":
    case "INVALID_REQUEST":
    case "TEXT_INPUT_INSUFFICIENT":
      return 400;
    case "AI_KEY_MISSING":
    case "AI_KEY_INVALID":
      return 401;
    case "AI_MODEL_ACCESS_DENIED":
      return 403;
    case "AI_QUOTA_EXCEEDED":
      return 429;
    case "PDP_IMAGE_QA_REJECTED":
      return 422;
    default:
      return 500;
  }
}

/**
 * Maps a PdpErrorCode to the HTTP status used by the original
 * `app/api/pdp/validate-key` route handler (no 400/429 branches).
 */
export function mapValidateApiKeyErrorCodeToStatus(code?: PdpErrorCode | string): number {
  switch (code) {
    case "AI_KEY_MISSING":
    case "AI_KEY_INVALID":
      return 401;
    case "AI_MODEL_ACCESS_DENIED":
      return 403;
    default:
      return 500;
  }
}

function throwFromErrorResponse(response: {
  code: PdpErrorCode;
  message: string;
  detail?: string;
  billableImages?: number;
}): never {
  // 실패해도 이미 만든 장수는 잃지 않는다. 라우트가 그 값으로 비용을 남긴다.
  throw new PdpServiceError(response.code, response.message, response.detail, response.billableImages);
}

/**
 * Analyze a product image and produce a full landing-page blueprint with the
 * hero section image generated. Mirrors `PdpController.analyze(body, apiKey)`
 * as called by `app/api/pdp/analyze/route.ts`.
 *
 * @param input parsed `PdpAnalyzeRequest` body
 * @param llm provider built by `apps/web/lib/pdp/providers.ts`
 * @returns the `result` payload (`{ originalImage, blueprint }`)
 * @throws PdpServiceError carrying a `PdpErrorCode` on failure
 */
export async function analyzeProduct(
  input: PdpAnalyzeRequest,
  llm?: PdpLlm,
  options?: { skipFirstImage?: boolean }
): Promise<PdpAnalyzeSuccessResponse["result"]> {
  const response = await controller.analyze(input, llm, options);

  if (response.ok) {
    return response.result;
  }

  throwFromErrorResponse(response);
}

/**
 * Generate a single section image. Mirrors
 * `PdpController.generateImage(body, apiKey)` as called by
 * `app/api/pdp/images/route.ts`.
 *
 * @param input parsed `PdpGenerateImageRequest` body
 * @param llm provider built by `apps/web/lib/pdp/providers.ts`
 * @returns `{ imageBase64, mimeType }`
 * @throws PdpServiceError carrying a `PdpErrorCode` on failure
 */
export async function generateSectionImage(
  input: PdpGenerateImageRequest,
  llm?: PdpLlm
): Promise<{
  imageBase64: string;
  mimeType: string;
  /** fal 이 실제로 만든 장수(재시도 포함). 호출자가 비용으로 기록한다. */
  generatedImages: number;
  qa?: { warnings: QaDefect[] };
}> {
  const response = await controller.generateImage(input, llm);

  if (response.ok) {
    return {
      imageBase64: response.imageBase64,
      mimeType: response.mimeType,
      generatedImages: response.generatedImages,
      qa: response.qa
    };
  }

  throwFromErrorResponse(response);
}

