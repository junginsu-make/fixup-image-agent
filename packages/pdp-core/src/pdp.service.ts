import { Type } from "./pdp.llm";
import type { PdpLlm } from "./pdp.llm";
import {
  IMAGE_LOOKS,
  userInstructionHead,
  userInstructionTail,
  type ImageLook,
} from "@fixup/shared";
import type {
  AspectRatio,
  CopyIntensity,
  GapPolicy,
  ImageGenOptions,
  ImageGenOptionsInput,
  ImageModelId,
  LandingPageBlueprint,
  PdpGuidePriorityMode,
  PdpOutputMode,
  PdpAnalyzeRequest,
  PdpErrorCode,
  QaDefect,
  ReferenceImage,
  SectionBlueprint
} from "./types";
import { DEFAULT_IMAGE_MODEL } from "./types";
import { classifyOutcome, qaRetryDirective, runQaGate, type QaOutcome } from "./pdp.qa";
import type { ImageGenerator, PdpProviders } from "./pdp.image-provider";
import {
  DEFAULT_PDP_LOOK,
  buildImageJson,
  buildImageSystemPrompt,
  type ImagePromptOptions,
} from "./pdp.image-prompt";
import { shouldSendAnchor } from "./pdp.product-anchor";
import { SALES_PRINCIPLES } from "./pdp.sales-principles";
import { buildSellerBriefPrompt, type SellerBrief } from "./pdp.seller-brief";
import { intensityRules } from "./pdp.copy-intensity";
import { photoGapPolicyRules } from "./pdp.product-reading";
import {
  REVIEW_SCHEMA,
  buildRevisionDirective,
  buildReviewPrompt,
  needsRevision,
  normalizeReview,
  reviewPenalty,
} from "./pdp.review";
import {
  PRODUCT_GROUNDING_RULES,
  PRODUCT_READING_RULES,
  PRODUCT_READING_SCHEMA,
  normalizeProductReading,
} from "./pdp.product-reading";
import { buildReferenceRoleDirective } from "./pdp.reference-policy";

const DEFAULT_IMAGE_MIME = "image/jpeg";

const REFERENCE_MODEL_MAX_ATTEMPTS = 3;
// 풀이미지 QA 게이트 재시도 상한(초기 1 + 재생성 최대 1). 속도 우선(결정 #4).
const QA_MAX_ATTEMPTS = 2;

type GeneratedImagePayload = {
  base64: string;
  mimeType: string;
};

type QaResult = {
  passed: boolean;
  blocking: QaDefect[];
  warnings: QaDefect[];
  attempts: number;
};

/** `generatedImages` 는 fal 이 실제로 만든 장수다(재시도 포함) — 비용 계산의 근거. */
type SectionImageResult = GeneratedImagePayload & { qa?: QaResult; generatedImages: number };

type ReferenceModelProfile = {
  genderPresentation: string;
  ageImpression: string;
  faceShape: string;
  hairstyle: string;
  skinTone: string;
  eyeDetails: string;
  browDetails: string;
  lipDetails: string;
  overallVibe: string;
  distinctiveFeatures: string[];
  keepTraits: string[];
  flexibleTraits: string[];
};

type GeneratedImageValidation = {
  isSamePerson: boolean;
  genderPresentationPreserved: boolean;
  styleMatch: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  correctionFocus: string[];
};

type InternalImageGenOptions = ImageGenOptions & {
  guidePriorityMode: PdpGuidePriorityMode;
  referenceModelProfile?: ReferenceModelProfile | null;
  retryDirective?: string;
  imageModel?: ImageModelId;
  /**
   * 페이지의 디자인 언어를 정하는 참조 이미지. 페이지당 한 장을 모든 섹션이 공유한다.
   * 여러 장을 섞으면 섹션 간 통일이 깨져서 첫 장만 쓴다.
   */
  styleReferenceImages?: Array<{ base64: string; mimeType: string; description?: string }>;
  /** 제품 이미지를 지킬 것인가. 자세한 판단은 pdp.product-anchor 참조. */
  preserveProductImage?: boolean;
  /** 이 페이지에 고정할 인물. 섹션에 맞는 각도 한 장. */
  characterReference?: { base64: string; mimeType: string; identityPrompt: string };
  /** 강조할 단어. 시나리오 단계에서 정한다. */
  emphasisWords?: string[];
};

/**
 * 들어오는 옵션. 빠진 칸은 `normalizeImageOptions` 가 채운다.
 *
 * 완성된 `InternalImageGenOptions` 와 일부러 나눠 둔다 — 하나로 두면 라우트에서
 * `as` 로 눌러야 하고, 그러면 진짜 어긋남까지 같이 눌린다.
 */
type InternalImageGenOptionsInput = Partial<InternalImageGenOptions>;

/** 아는 결인지 확인한다. 모르는 값은 기본값으로 되돌린다. */
function normalizeLook(value: ImageLook | string | undefined): ImageLook {
  return (IMAGE_LOOKS as readonly string[]).includes(String(value ?? ""))
    ? (value as ImageLook)
    : DEFAULT_PDP_LOOK;
}

type NormalizedReferenceModelImage = {
  base64: string;
  mimeType: string;
};

export class PdpServiceError extends Error {
  constructor(
    readonly code: PdpErrorCode,
    message: string,
    readonly detail?: string,
    /**
     * 실패했지만 이미 fal 에서 만들어 낸 장수. 회원에게는 차감하지 않아도
     * 우리는 값을 치렀다. 이걸 안 실으면 그 돈은 장부에서 사라진다.
     */
    readonly billableImages?: number
  ) {
    super(message);
    this.name = "PdpServiceError";
  }
}

type LlmPart = { text?: string; inlineData?: { data: string; mimeType: string } };

export interface LegacyContentsClient {
  llm: PdpLlm;
  models: {
    generateContent(args: {
      name: string;
      contents: Array<{ parts: LlmPart[] }>;
      config?: { responseSchema?: unknown; maxOutputTokens?: number };
    }): Promise<{ text: string }>;
  };
}

/**
 * 옛 호출 모양을 그대로 받는 어댑터.
 *
 * 이 파일의 네 호출 자리에는 **시험이 하나도 없다**. 호출 모양까지 한꺼번에
 * 고치면 안 잡히는 자리 넷을 동시에 건드리게 된다. 그래서 부르는 쪽은 그대로
 * 두고 말단만 갈아끼웠다 — 프롬프트도 스키마도 한 글자 안 바뀐다.
 *
 * `parts` 안의 글은 이어 붙이고 그림은 순서대로 뽑는다. 순서가 중요하다 —
 * 구성안 만들 때 첫 그림이 제품이고 둘째가 인물이다.
 */
function legacyContentsClient(llm: PdpLlm): LegacyContentsClient {
  return {
    llm,
    models: {
      async generateContent(args) {
        const parts = args.contents.flatMap((entry) => entry.parts);
        return llm.generate({
          name: args.name,
          prompt: parts
            .map((part) => part.text)
            .filter((text): text is string => Boolean(text))
            .join("\n\n"),
          images: parts
            .filter((part) => part.inlineData)
            .map((part) => ({
              base64: part.inlineData!.data,
              mimeType: part.inlineData!.mimeType,
            })),
          schema: args.config?.responseSchema,
          maxTokens: args.config?.maxOutputTokens ?? 8192,
        });
      },
    },
  };
}

export class PdpService {
  async analyzeProduct(
    request: PdpAnalyzeRequest,
    providers?: PdpProviders,
    options?: { skipFirstImage?: boolean }
  ) {
    const resolved = this.requireProviders(providers);
    const normalizedImage = sanitizeBase64Payload(request.imageBase64);
    const mimeType = normalizeMimeType(request.mimeType);
    const referenceModelImage = normalizeReferenceModelImage(request.modelImageBase64, request.modelImageMimeType);
    const client = this.getClient(resolved.llm);
    const referenceModelProfile =
      referenceModelImage ? await this.extractReferenceModelProfile(client, referenceModelImage) : null;

    // 구성안을 짤 때부터 레퍼런스를 본다. 안 주면 `style_guide` 를 상상으로 채운다.
    // 제품·인물과 같은 손질을 거친다. 레퍼런스만 건너뛰면 `data:` 접두사가
    // 붙어 오거나 그림이 아닌 형식이 와도 그대로 모델에 실린다.
    const styleReferenceForPlan = request.styleReference?.imageBase64?.trim()
      ? {
          imageBase64: sanitizeBase64Payload(request.styleReference.imageBase64),
          mimeType: normalizeMimeType(request.styleReference.mimeType),
          description: request.styleReference.description,
          intent: request.styleReference.intent,
        }
      : undefined;

    /**
     * 세로로 긴 레퍼런스는 **조각으로 나눠 온다**(`apps/web` 이 자른다).
     *
     * 통째로 보내면 모델이 긴 변 기준으로 줄여 폭 100픽셀짜리 띠가 된다.
     * 조각이 없으면 원본 한 장을 그대로 쓴다.
     */
    const styleReferenceImages = styleReferenceForPlan
      ? (request.styleReference?.slices?.length
          ? request.styleReference.slices.map((slice) => ({
              base64: sanitizeBase64Payload(slice.imageBase64),
              mimeType: normalizeMimeType(slice.mimeType),
            }))
          : [{ base64: styleReferenceForPlan.imageBase64, mimeType: styleReferenceForPlan.mimeType }])
      : [];
    const analyzePrompt = buildAnalyzePrompt(
      request.additionalInfo,
      request.desiredTone,
      referenceModelProfile,
      request.outputMode,
      request.sellerBrief,
      request.copyIntensity,
      request.gapPolicy,
      styleReferenceForPlan
        ? {
            styleReference: {
              description: styleReferenceForPlan.description,
              intent: styleReferenceForPlan.intent,
              sliceCount: styleReferenceImages.length,
            },
          }
        : undefined,
    );

    const makeBlueprint = (revisionDirective: string) => retryOperation(async () => {
      const response = await client.models.generateContent({
        name: "pdp_blueprint",
        contents: [
          {
            parts: [
              buildHighResolutionInlinePart(mimeType, normalizedImage),
              ...(referenceModelImage ? [buildHighResolutionInlinePart(referenceModelImage.mimeType, referenceModelImage.base64)] : []),
              // 디자인 레퍼런스는 맨 뒤다. 제품이 첫 그림이어야 프롬프트의
              // 「이 제품」이 가리키는 것이 어긋나지 않는다.
              ...styleReferenceImages.map((image) =>
                buildHighResolutionInlinePart(image.mimeType, image.base64),
              ),
              {
                // 지적사항은 규칙보다 앞에 둔다. 뒤에 붙이면 긴 규칙에 묻혀 무시된다.
                text: revisionDirective
                  ? `${revisionDirective}

${analyzePrompt}`
                  : analyzePrompt
              }
            ]
          }
        ] as any,
        config: {
          responseSchema: {
            type: Type.OBJECT,
            // productReading 이 맨 앞이다. JSON 은 앞에서부터 만들어지므로 먼저 적은
            // 제품 사실이 뒤에 쓰는 카피의 조건이 된다 — 호출을 늘리지 않고 순서를 만든다.
            properties: {
              productReading: PRODUCT_READING_SCHEMA,
              executiveSummary: { type: Type.STRING },
              scorecard: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    score: { type: Type.STRING },
                    reason: { type: Type.STRING }
                  }
                }
              },
              blueprintList: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    section_id: { type: Type.STRING },
                    section_name: { type: Type.STRING },
                    goal: { type: Type.STRING },
                    headline: { type: Type.STRING },
                    headline_en: { type: Type.STRING },
                    subheadline: { type: Type.STRING },
                    subheadline_en: { type: Type.STRING },
                    bullets: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    bullets_en: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    trust_or_objection_line: { type: Type.STRING },
                    trust_or_objection_line_en: { type: Type.STRING },
                    CTA: { type: Type.STRING },
                    CTA_en: { type: Type.STRING },
                    layout_notes: { type: Type.STRING },
                    compliance_notes: { type: Type.STRING },
                    image_id: { type: Type.STRING },
                    purpose: { type: Type.STRING },
                    prompt_ko: { type: Type.STRING },
                    prompt_en: { type: Type.STRING },
                    negative_prompt: { type: Type.STRING },
                    style_guide: { type: Type.STRING },
                    reference_usage: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      return parseBlueprintResponse(response);
    });

    /**
     * 심사는 품질을 올리려는 장치다. 그것 때문에 생성 자체가 죽으면 손해가 더 크다.
     * 실패하면 심사 없이 진행한다 — 심사를 붙이기 전과 같은 상태가 된다.
     */
    const runReview = async (candidate: LandingPageBlueprint) => {
      try {
        const response = await client.models.generateContent({
          name: "pdp_review",
          contents: [{ parts: [{ text: buildReviewPrompt(candidate, SALES_PRINCIPLES) }] }] as never,
          config: {
            responseSchema: REVIEW_SCHEMA as never,
          },
        });
        return normalizeReview(JSON.parse(extractResponseText(response)));
      } catch {
        return null;
      }
    };

    let blueprint = await makeBlueprint("");
    let review = await runReview(blueprint);

    // 사진 경로는 텍스트 경로보다 상한을 좁게 잡는다. 여기는 "사진 한 장 넣고 빨리
    // 받는" 길이라, 품질을 올리자고 대기 시간을 두 배로 만들면 길의 성격이 바뀐다.
    if (review && needsRevision(review)) {
      const revised = await makeBlueprint(buildRevisionDirective(review));
      const revisedReview = await runReview(revised);
      // 고친 것이 더 나쁘면 원래 것을 쓴다. 재작성이 늘 개선은 아니다.
      if (reviewPenalty(revisedReview) < reviewPenalty(review)) {
        blueprint = revised;
        review = revisedReview;
      }
    }

    const firstSection = blueprint.sections[0];

    if (!firstSection) {
      throw new PdpServiceError(
        "AI_RESPONSE_INVALID",
        "상세페이지 섹션을 생성하지 못했습니다.",
        "No sections returned from analyze response."
      );
    }

    if (!options?.skipFirstImage) {
      const firstImage = await this.generateSectionImageInternal({
      originalImageBase64: normalizedImage,
      section: firstSection,
      aspectRatio: request.aspectRatio,
      desiredTone: request.desiredTone,
      options: {
        style: "studio",
        withModel: true,
        modelGender: "female",
        modelAgeRange: "20s",
        modelCountry: "korea",
        guidePriorityMode: "guide-first",
        headline: firstSection.headline,
        subheadline: firstSection.subheadline,
        referenceModelImageBase64: referenceModelImage?.base64,
        referenceModelImageMimeType: referenceModelImage?.mimeType,
        referenceModelProfile,
        outputMode: request.outputMode,
        imageModel: request.imageModel ?? DEFAULT_IMAGE_MODEL
      },
      client,
      generateImage: resolved.generateImage
    });

      blueprint.sections[0] = {
        ...firstSection,
        generatedImage: toDataUrl(firstImage.mimeType, firstImage.base64),
        // analyze 경로는 blueprint 보존을 위해 throw하지 않고 결함을 경고로만 표기한다.
        qaWarnings: firstImage.qa
          ? [...firstImage.qa.blocking, ...firstImage.qa.warnings]
          : undefined
      };
    }

    return {
      originalImage: normalizedImage,
      blueprint,
      // 심사 결과를 함께 돌려준다. 화면이 이미 받을 준비가 돼 있는데
      // (ScenarioEditor 의 review) 사진 경로만 늘 비어 있었다.
      review: review ?? undefined
    };
  }

  async generateSectionImage(request: {
    originalImageBase64: string;
    section: SectionBlueprint;
    aspectRatio: AspectRatio;
    desiredTone?: string;
    options?: ImageGenOptionsInput;
  }, providers?: PdpProviders) {
    const resolved = this.requireProviders(providers);
    const client = this.getClient(resolved.llm);
    const normalizedReferenceModel = normalizeReferenceModelImage(
      request.options?.referenceModelImageBase64,
      request.options?.referenceModelImageMimeType
    );
    const referenceModelProfile =
      normalizedReferenceModel && request.options?.withModel
        ? await this.extractReferenceModelProfile(client, normalizedReferenceModel)
        : null;

    const image = await this.generateSectionImageInternal({
      ...request,
      client,
      generateImage: resolved.generateImage,
      options: request.options
        ? {
            ...request.options,
            guidePriorityMode: request.options.guidePriorityMode ?? "guide-first",
            referenceModelImageBase64: normalizedReferenceModel?.base64,
            referenceModelImageMimeType: normalizedReferenceModel?.mimeType,
            referenceModelProfile,
            imageModel: request.options?.imageModel ?? DEFAULT_IMAGE_MODEL
          }
        : undefined
    });

    // 크레딧 경로: 치명적 QA 결함이 남으면 실패 처리한다(라우트가 크레딧을 차감하지 않음).
    // 회원에게는 안 물리지만 만든 장수는 실어 보낸다 — 그 돈은 이미 나갔다.
    if (image.qa?.blocking.length) {
      throw new PdpServiceError(
        "PDP_IMAGE_QA_REJECTED",
        "생성 결과가 품질 기준(브랜드/왜곡/수치/제목 오타)에 미달했습니다. 다시 시도해 주세요.",
        JSON.stringify(image.qa.blocking),
        image.generatedImages
      );
    }

    return {
      imageBase64: image.base64,
      mimeType: image.mimeType,
      generatedImages: image.generatedImages,
      qa: image.qa ? { warnings: image.qa.warnings } : undefined
    };
  }

  private async generateSectionImageInternal(request: {
    originalImageBase64: string;
    section: SectionBlueprint;
    aspectRatio: AspectRatio;
    desiredTone?: string;
    options?: InternalImageGenOptionsInput;
    client?: LegacyContentsClient;
    /** 테스트에서 fal 호출을 대신 끼워 넣는 통로. 운영에서는 비운다. */
    generateImage?: ImageGenerator;
  }): Promise<SectionImageResult> {
    const client = request.client ?? this.getClient();
    const originalImageBase64 = sanitizeBase64Payload(request.originalImageBase64);
    const section = normalizeSection(request.section, 0);
    const normalizedReferenceModel = normalizeReferenceModelImage(
      request.options?.referenceModelImageBase64,
      request.options?.referenceModelImageMimeType
    );
    const options = normalizeImageOptions(request.options);
    const referenceModelProfile =
      normalizedReferenceModel && options.withModel
        ? request.options?.referenceModelProfile ?? (await this.extractReferenceModelProfile(client, normalizedReferenceModel))
        : null;

    if (!section.prompt_en) {
      throw new PdpServiceError(
        "INVALID_REQUEST",
        "이미지 프롬프트가 없는 섹션입니다.",
        "Section prompt_en is missing."
      );
    }

    const qaEnabled = options.outputMode === "full-image";
    const refMaxAttempts = normalizedReferenceModel && options.withModel ? REFERENCE_MODEL_MAX_ATTEMPTS : 1;
    // qa+ref 동시면 속도 우선(결정 #4)으로 QA_MAX_ATTEMPTS(2)를 상한으로 쓴다.
    const maxAttempts = qaEnabled ? QA_MAX_ATTEMPTS : refMaxAttempts;
    let lastGeneratedImage: GeneratedImagePayload | null = null;
    // fal 이 실제로 만들어 준 장수. 재시도하면 결과물은 한 장이어도 값은 여러
    // 번 치른다. 오류로 끝난 호출은 이미지가 없으므로 세지 않는다.
    let generatedImages = 0;
    let retryDirective = options.retryDirective;
    let lastQaOutcome: QaOutcome = { blocking: [], warnings: [] };
    // 이전 attempt 에서 확인된 blocking. fail-open(QA 인프라 실패)이 known-bad 를 통과로 위장하지 못하게 유지.
    let sawBlockingOutcome: QaOutcome | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // 참조 이미지는 fal 에 원본 그대로 첨부된다(image_urls). 텍스트로 요약하지
      // 않는다 — 요약하면 정보가 줄어든다. 모델에게 필요한 것은 **몇 번째 이미지가
      // 무엇이고 어떻게 다뤄야 하는가**뿐이고, buildReferenceRoleDirective 가 첨부
      // 순서 그대로 적어 준다. 정책은 pdp.reference-policy.ts 참조.
      const references: ReferenceImage[] = [];
      const styleReference = options.styleReferenceImages?.[0];

      // 참조가 둘이면 모델이 절충한다. 제품 보존을 끄면 앵커를 빼서
      // 레퍼런스의 디자인을 온전히 받는다.
      if (
        shouldSendAnchor({
          hasStyleReference: Boolean(styleReference),
          preserveProduct: options.preserveProductImage ?? true,
        })
      ) {
        references.push({
          kind: "anchor",
          base64: originalImageBase64,
          mimeType: DEFAULT_IMAGE_MIME,
          intent: options.attachmentIntents?.anchor,
        });
      }

      // 얼굴은 하나만 보낸다. 둘을 넣으면 모델이 절충해 제3의 인물이 나온다.
      // 업로드한 사진이 캐릭터보다 우선이다 — 사용자가 방금 고른 쪽이다.
      const usesUploadedPerson = Boolean(normalizedReferenceModel && options.withModel);
      const usesCharacter = !usesUploadedPerson && Boolean(options.characterReference);

      if (usesUploadedPerson && normalizedReferenceModel) {
        references.push({
          kind: "person",
          base64: normalizedReferenceModel.base64,
          mimeType: normalizedReferenceModel.mimeType,
          intent: options.attachmentIntents?.person,
        });
      } else if (usesCharacter && options.characterReference) {
        references.push({
          kind: "person",
          base64: options.characterReference.base64,
          mimeType: options.characterReference.mimeType,
          intent: options.attachmentIntents?.person,
        });
      }

      // 페이지당 한 장만 쓴다. 여러 장을 섞으면 섹션 간 통일이 깨진다.
      //
      // 서술을 함께 보낸다. 이미지를 대체하는 것이 아니라, 이미지만으로 전달되지
      // 않는 **색의 쓰임새**(면으로 쓰나 글자로 쓰나)를 보태는 것이다 — 실측 근거는
      // pdp.reference-policy.ts 의 표. 서술이 없으면 그냥 이미지만 간다.
      if (styleReference) {
        references.push({
          kind: "style",
          base64: styleReference.base64,
          mimeType: styleReference.mimeType,
          description: styleReference.description,
          intent: options.attachmentIntents?.style,
        });
      }

      const promptOptions: ImagePromptOptions = {
        style: options.style,
        // "이 섹션에 인물컷이 필요하다"는 뜻이다. 사용자가 켰고 **인물 참조가 실제로
        // 붙었을 때만** 참이다. 예전에는 업로드 사진만 셌다 — 그래서 캐릭터를 골라
        // 인물컷을 켜도 장면은 "사람은 선택"이라고 말했고, 얼굴을 지키라는 사진이
        // 첨부됐는데 정작 사람이 안 나올 수 있었다.
        withModel: Boolean(options.withModel && (usesUploadedPerson || usesCharacter)),
        outputMode: options.outputMode ?? "editable",
        emphasisWords: options.emphasisWords,
        desiredTone: request.desiredTone,
        // 화면에서 고른 인물 조건. 안 넘기면 프롬프트가 늘 「20대 한국 여성」으로
        // 간다 — 손잡이는 돌아가는데 엔진이 안 보던 자리다.
        pageContext: options.pageContext,
        modelGender: options.modelGender,
        modelAgeRange: options.modelAgeRange,
        modelCountry: options.modelCountry,
        guidePriorityMode: options.guidePriorityMode,
        look: options.look
      };

      // 캐릭터는 생김새 서술을 함께 준다 — 이미지 한 장으로는 옆·뒷모습을 만들 때
      // 근거가 부족하다. 업로드한 사진에는 이런 서술이 없다.
      //
      // **캐릭터를 실제로 보냈을 때만** 싣는다. 사진이 우선해 캐릭터가 빠졌는데도
      // 서술을 실으면, 첨부된 얼굴과 다른 사람을 묘사하게 된다.
      const characterIdentity =
        usesCharacter && options.characterReference?.identityPrompt
          ? `The person's identity: ${options.characterReference.identityPrompt}.`
          : "";

      // 재시도 지시(QA 결함 교정, 인물 불일치 교정)는 JSON 뒤에 덧붙인다.
      //
      // 사용자가 직접 친 말은 **맨 앞과 맨 뒤에 두 번** 넣는다. 2026-09-04 실측에서
      // 프롬프트 뒤에 긴 문단을 붙였더니 앞쪽 구도 지시가 밀려 무시됐다 — 긴
      // 프롬프트에서 중간 문장은 힘을 잃는다. 가장 중요한 것은 양끝에 둔다.
      const prompt = [
        userInstructionHead(options.userInstruction),
        buildImageJson(section, promptOptions),
        buildReferenceRoleDirective(references, {
          hasUserInstruction: Boolean(options.userInstruction),
        }),
        characterIdentity,
        retryDirective ? `Correction required: ${retryDirective}` : "",
        userInstructionTail(options.userInstruction),
      ]
        .filter(Boolean)
        .join("\n\n");

      // 생성은 fal.ai 를 경유한다. 모델별 입력 차이는 pdp.image-provider 가 흡수한다.
      // 프롬프트는 JSON 구조로 주고 아트 디렉션은 system 쪽으로 분리한다 —
      // 평문 대비 지시 준수가 확실히 높다(spec 1절 측정표).
      const generatedImage = await retryOperation(async () => {
        // 그림 만드는 통로는 바깥이 넣어 준다. 이 패키지는 fal 을 직접 안 부른다.
        const generate = request.generateImage;
        if (!generate) {
          throw new PdpServiceError(
            "AI_KEY_MISSING",
            "이미지 생성 키가 설정되지 않았습니다.",
            "no image generator was provided",
          );
        }
        // 위에서 만든 references 를 그대로 보낸다. 여기서 다시 만들면 프롬프트에
        // 적힌 번호와 실제 첨부 순서가 갈라진다 — 한쪽만 고치는 날 조용히 어긋난다.
        return generate(options.imageModel ?? DEFAULT_IMAGE_MODEL, {
          prompt,
          systemPrompt: buildImageSystemPrompt(promptOptions),
          aspectRatio: request.aspectRatio,
          references
        });
      });

      lastGeneratedImage = generatedImage;
      generatedImages += 1;

      let refOk = true;
      let refDirective = "";
      if (normalizedReferenceModel && options.withModel && referenceModelProfile) {
        const validation = await this.validateGeneratedImage(client, {
          generatedImage,
          referenceModelImage: normalizedReferenceModel,
          referenceModelProfile,
          expectedStyle: options.style
        });
        refOk = validation.isSamePerson && validation.genderPresentationPreserved && validation.styleMatch;
        if (!refOk) {
          refDirective = buildRetryDirective(validation, referenceModelProfile, options.style);
        }
      }

      let qaOk = true;
      let qaDirective = "";
      if (qaEnabled) {
        const verdict = await runQaGate(client.llm, { generatedImage, section });
        if (verdict.parseError && sawBlockingOutcome) {
          // fail-open 이지만 이전에 확인된 blocking 을 통과로 위장하지 않는다.
          lastQaOutcome = sawBlockingOutcome;
          qaOk = false;
          qaDirective = qaRetryDirective({ defects: sawBlockingOutcome.blocking });
        } else {
          lastQaOutcome = classifyOutcome(verdict);
          qaOk = lastQaOutcome.blocking.length === 0;
          if (lastQaOutcome.blocking.length) {
            sawBlockingOutcome = lastQaOutcome;
          }
          if (verdict.defects.length) {
            qaDirective = qaRetryDirective(verdict);
          }
        }
      }

      if (refOk && qaOk) {
        return {
          ...generatedImage,
          generatedImages,
          qa: qaEnabled
            ? { passed: true, blocking: [], warnings: lastQaOutcome.warnings, attempts: attempt + 1 }
            : undefined
        };
      }

      retryDirective = [refDirective, qaDirective].filter(Boolean).join(" ");
    }

    if (!lastGeneratedImage) {
      throw new PdpServiceError(
        "PDP_IMAGE_GENERATION_FAILED",
        "이미지를 생성하지 못했습니다.",
        "No image was generated during the retry loop."
      );
    }

    return {
      ...lastGeneratedImage,
      generatedImages,
      qa: qaEnabled
        ? {
            passed: lastQaOutcome.blocking.length === 0,
            blocking: lastQaOutcome.blocking,
            warnings: lastQaOutcome.warnings,
            attempts: maxAttempts
          }
        : undefined
    };
  }

  /** 바깥세상 통로가 다 왔는지 확인한다. 없으면 무엇이 없는지 알린다. */
  private requireProviders(providers?: PdpProviders): PdpProviders {
    if (!providers?.llm) {
      throw new PdpServiceError("AI_KEY_MISSING", "AI 공급자 키가 설정되지 않았습니다.");
    }
    return providers;
  }

  private getClient(llm?: PdpLlm) {
    if (!llm) {
      throw new PdpServiceError(
        "AI_KEY_MISSING",
        "AI 공급자 키가 설정되지 않았습니다."
      );
    }
    return legacyContentsClient(llm);
  }

  private async extractReferenceModelProfile(client: LegacyContentsClient, referenceModelImage: NormalizedReferenceModelImage) {
    const response = await client.models.generateContent({
      name: "pdp_person_profile",
      contents: [
        {
          parts: [
            {
              text:
                "Analyze the uploaded reference person image and describe the same identifiable person for future commercial image generation. Focus on stable visual identity traits, not styling suggestions. Return JSON only."
            },
            buildHighResolutionInlinePart(referenceModelImage.mimeType, referenceModelImage.base64)
          ]
        }
      ] as any,
      config: {
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            genderPresentation: { type: Type.STRING },
            ageImpression: { type: Type.STRING },
            faceShape: { type: Type.STRING },
            hairstyle: { type: Type.STRING },
            skinTone: { type: Type.STRING },
            eyeDetails: { type: Type.STRING },
            browDetails: { type: Type.STRING },
            lipDetails: { type: Type.STRING },
            overallVibe: { type: Type.STRING },
            distinctiveFeatures: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            keepTraits: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            flexibleTraits: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    return parseReferenceModelProfileResponse(response);
  }

  private async validateGeneratedImage(
    client: LegacyContentsClient,
    input: {
      generatedImage: GeneratedImagePayload;
      referenceModelImage: NormalizedReferenceModelImage;
      referenceModelProfile: ReferenceModelProfile;
      expectedStyle: NonNullable<ImageGenOptions["style"]>;
    }
  ) {
    const response = await client.models.generateContent({
      name: "pdp_person_check",
      contents: [
        {
          parts: [
            {
              text: buildValidationPrompt(input.referenceModelProfile, input.expectedStyle)
            },
            buildHighResolutionInlinePart(input.referenceModelImage.mimeType, input.referenceModelImage.base64),
            buildHighResolutionInlinePart(input.generatedImage.mimeType, input.generatedImage.base64)
          ]
        }
      ] as any,
      config: {
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isSamePerson: { type: Type.BOOLEAN },
            genderPresentationPreserved: { type: Type.BOOLEAN },
            styleMatch: { type: Type.BOOLEAN },
            confidence: { type: Type.STRING },
            reason: { type: Type.STRING },
            correctionFocus: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    return parseGeneratedImageValidationResponse(response);
  }
}

/**
 * 오류 봉투. `billableImages` 는 실패했지만 이미 만들어 낸 장수다 — 라우트가
 * 이 값으로 비용을 남긴다. 모든 갈래가 같은 모양을 갖도록 반환형을 못 박는다.
 */
export function toPdpErrorResponse(error: unknown): {
  ok: false;
  code: PdpErrorCode;
  message: string;
  detail?: string;
  billableImages?: number;
} {
  if (error instanceof PdpServiceError) {
    return {
      ok: false as const,
      code: error.code,
      message: error.message,
      detail: error.detail,
      // 실패해도 이미 만든 장은 비용이다. 라우트가 이 값으로 기록한다.
      billableImages: error.billableImages
    };
  }

  const detail = stringifyError(error);
  const message = error instanceof Error ? error.message : "상세페이지 마법사 처리 중 오류가 발생했습니다.";

  if (isInvalidApiKeyError(message)) {
    return {
      ok: false as const,
      code: "AI_KEY_INVALID" as const,
      message: "AI 공급자 키를 확인할 수 없습니다. 운영자에게 문의해 주세요.",
      detail
    };
  }

  if (isPermissionError(message)) {
    return {
      ok: false as const,
      code: "AI_MODEL_ACCESS_DENIED" as const,
      message:
        "현재 키로는 상세페이지 생성에 필요한 모델을 쓸 수 없습니다. 운영자에게 문의해 주세요.",
      detail
    };
  }

  if (isQuotaError(message)) {
    return {
      ok: false as const,
      code: "AI_QUOTA_EXCEEDED" as const,
      message: "AI 사용량이 초과되었습니다. 잠시 후 다시 시도하거나 quota 상태를 확인해 주세요.",
      detail
    };
  }

  if (isJsonError(message)) {
    return {
      ok: false as const,
      code: "AI_RESPONSE_INVALID" as const,
      message: "AI 응답을 해석하지 못했습니다. 같은 이미지로 다시 시도해 주세요.",
      detail
    };
  }

  return {
    ok: false as const,
    code: "PDP_ANALYZE_FAILED" as const,
    message: "상세페이지 마법사 처리 중 오류가 발생했습니다.",
    detail
  };
}

function normalizeMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();

  if (!normalized.startsWith("image/")) {
    throw new PdpServiceError(
      "INVALID_IMAGE_PAYLOAD",
      "이미지 파일만 업로드할 수 있습니다.",
      `Unsupported mime type: ${mimeType}`
    );
  }

  return normalized;
}

function sanitizeBase64Payload(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/^data:[^;]+;base64,(.+)$/);
  const normalized = (match ? match[1] : trimmed).replace(/\s/g, "");

  if (!normalized || !/^[A-Za-z0-9+/]+=*$/.test(normalized)) {
    throw new PdpServiceError(
      "INVALID_IMAGE_PAYLOAD",
      "이미지 데이터가 올바르지 않습니다.",
      "Malformed base64 payload."
    );
  }

  try {
    const bytes = Buffer.from(normalized, "base64");
    if (!bytes.byteLength) {
      throw new Error("empty payload");
    }
  } catch {
    throw new PdpServiceError(
      "INVALID_IMAGE_PAYLOAD",
      "이미지 데이터를 읽을 수 없습니다.",
      "Buffer.from failed for image payload."
    );
  }

  return normalized;
}

export function buildAnalyzePrompt(
  additionalInfo?: string,
  desiredTone?: string,
  referenceModelProfile?: ReferenceModelProfile | null,
  outputMode: PdpOutputMode = "editable",
  sellerBrief?: SellerBrief,
  copyIntensity: CopyIntensity = "normal",
  gapPolicy: GapPolicy = "ask",
  /**
   * 나중에 붙은 것들. **객체로 받는다.**
   *
   * 앞의 일곱은 자리로 받는데, 여덟 번째부터도 그렇게 하면 부르는 쪽이
   * `undefined` 를 여섯 개씩 늘어놓게 된다. 새로 늘어나는 것은 여기 담는다.
   */
  extras?: {
    styleReference?: {
      description?: string;
      intent?: string;
      /** 조각으로 나눠 보냈으면 몇 장인지. 모델이 순서를 알아야 이어 읽는다. */
      sliceCount?: number;
    };
  },
) {
  const referenceModelPrompt = referenceModelProfile
    ? `[참고 모델 이미지가 함께 제공됨]: 모델이 포함되는 컷은 업로드된 동일 인물의 정체성을 유지해야 합니다.
- 유지할 핵심 특성: ${referenceModelProfile.keepTraits.join(", ")}
- 식별 포인트: ${referenceModelProfile.distinctiveFeatures.join(", ")}
- 전체 인상: ${referenceModelProfile.overallVibe}`
    : "";

  /**
   * **구성안을 짤 때 레퍼런스를 본다.**
   *
   * 전에는 이미지를 만들 때 처음 등장했다. 그래서 `style_guide` 를 기획이
   * 상상으로 채웠고, 그 값이 그대로 이미지 프롬프트의 `design_system` 이 됐다.
   *
   * 서술과 사용자 지시를 함께 싣는다. 그림만 보내면 「무엇을 가져올지」가
   * 사람마다 다르게 읽힌다.
   */
  const styleReferencePrompt = extras?.styleReference
    ? [
        (extras.styleReference.sliceCount ?? 1) > 1
          ? `[디자인 레퍼런스가 함께 제공됨 — ${extras.styleReference.sliceCount} images are slices of ONE long detail page, top to bottom, in order. Read them as a single page.]`
          : "[디자인 레퍼런스가 함께 제공됨 — a design reference image is attached]",
        "- 이 이미지는 **어떻게 보이는가**만 준다. 레이아웃·여백·색 쓰임·서체 인상·분위기를 읽어",
        "  각 섹션의 `style_guide` 를 이 이미지 기준으로 채울 것.",
        "- **Do not copy its product, its people, its text content or its specific scene.**",
        "  담을 내용은 이 제품의 사실에서만 나온다. 레퍼런스의 문구를 옮겨 적지 말 것.",
        /*
          **순서가 이미지 경로와 같아야 한다.**

          `pdp.reference-policy.ts` 는 사용자가 적은 말을 먼저 놓고, 기계가 읽어
          적은 서술을 뒤에 「참고용」으로 붙인다. 반대로 놓으면 「배치는 무시해
          주세요」 위에 배치 서술이 앉아 방금 한 말이 묻힌다.

          그리고 **범위를 그 그림으로 좁힌다.** 이 프롬프트에는 근거 없는 숫자
          금지·표시광고 규칙이 함께 실려 있다. 「다른 지시보다 우선」이라고 쓰면
          첨부칸에 적은 한 줄이 그것들 위에 놓인다고 읽힐 수 있다.
        */
        extras.styleReference.intent?.trim()
          ? `- 이 그림에 대해서는 사용자가 적은 말을 따를 것: ${extras.styleReference.intent.trim()}`
          : "",
        extras.styleReference.description?.trim()
          ? `- 이 레퍼런스가 디자인 언어를 쓰는 방식${
              extras.styleReference.intent?.trim() ? "(참고용 — 위 지시가 이긴다)" : ""
            }: ${extras.styleReference.description.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  /**
   * `style_guide` 설명이 한 프롬프트에 두 번, 다른 어휘로 있으면 안 된다.
   *
   * 위쪽 레퍼런스 블록은 그래픽 디자인 어휘로 말하고 여기는 사진 연출 어휘로
   * 말했다. 이 파일 자신의 규칙대로면 **뒤에 있는 쪽이 이긴다** — 레퍼런스를
   * 보여 준 의미가 조용히 희석된다.
   *
   * 「디자인 가이드 우선 모드에서만 강하게」도 뺐다. `pdp.image-prompt.ts` 는
   * `design_system = style_guide` 를 조건 없이 한다. 기획에게 스스로 힘을
   * 빼라고 말할 이유가 없다.
   */
  const styleGuideFieldRule = extras?.styleReference
    ? "- style_guide: 전체 통일 스타일. **위에 첨부된 디자인 레퍼런스를 기준으로** 레이아웃·여백·색 쓰임·서체 인상을 적을 것."
    : "- style_guide: 전체 통일 스타일. 스튜디오는 정제된 세트/조명/질감, 라이프스타일은 현실감 있는 공간/행동, 아웃도어는 위치감/공기감/활동성을 분명히 적을 것.";

  const outputModePrompt =
    outputMode === "full-image"
      ? `[출력 모드: 통이미지(full-image)]
- 각 섹션은 이미지 자체에 한국어 헤드라인 1줄 + 짧은 서브카피 1줄 + 포인트 카드 3개 + 작은 신뢰문구 1줄이 담긴 완성형 디자인으로 생성될 수 있게 설계할 것.
- 담을 글자 수가 정해져 있으므로 **각 문구를 짧게** 쓸 것. 개수를 줄이는 것이 아니라 문구를 줄여서 맞출 것.
- 모바일 가독성 최우선: 1080px 결과가 390px 화면에 축소돼도 확대 없이 읽혀야 하므로 긴 문장/작은 본문/복잡한 표/촘촘한 설명/각주형 텍스트를 만들지 말 것.
- 카드·배너 안에서 문구가 잘리거나 말줄임표로 끝나면 실패. 공간이 부족하면 **문구를 짧게 줄일 것.** 카드를 빼서 맞추지 말 것.
- 전 섹션 한글 타이포는 Pretendard 또는 Noto Sans KR 같은 현대 산세리프 한 계열로 통일할 것. 손글씨체·세리프·장식 서체를 섞지 말 것.
- "사진 위에 글자 얹은" 느낌이 아니라 실제 1080px 모바일 상세페이지 섹션처럼 편집 그리드·여백·타이포 위계·구분선·정보 카드·콜아웃 칩을 포함해 설계할 것.
- 통이미지는 실제 링크를 걸 수 없다. 이미지 안에 버튼, 화살표, 링크형 CTA("제품 확인하기","지금 확인하기","구매하기","자세히 보기" 등)를 만들지 말 것.
- visible copy는 섹션 역할명(예: "문제 제기","가이드 제안")을 그대로 쓰지 말고, 실제 제품과 고객 상황이 드러나는 고객-facing 판매 문장으로 작성할 것.`
      : `[출력 모드: 텍스트편집(editable)]
- 생성 이미지에는 헤드라인·카피 등 어떤 글자도 넣지 않는 고품질 배경/제품/모델컷으로 만들 것. 텍스트는 편집기에서 별도 레이어로 얹는다.
- 편집 텍스트가 올라갈 좌/우/하단 여백을 남기고, 인물 얼굴·제품 핵심이 예상 헤드라인 영역과 겹치지 않게 섹션별 구도를 설계할 것.`;

  return `
이 제품 이미지를 분석하여 5~6개의 핵심 섹션으로 구성된 상세페이지 전체 블루프린트를 설계해주세요.

${buildSellerBriefPrompt(sellerBrief)}

${intensityRules(copyIntensity)}

${photoGapPolicyRules(gapPolicy)}

${PRODUCT_READING_RULES}

${PRODUCT_GROUNDING_RULES}

${SALES_PRINCIPLES}
${outputModePrompt}
${additionalInfo ? `[사용자 추가 정보]: ${additionalInfo}` : ""}
${desiredTone ? `[원하는 디자인 톤]: ${desiredTone}` : ""}
${referenceModelPrompt}
${styleReferencePrompt}

# 섹션 템플릿(필수 필드)
- section_id: S1~S6
- section_name: (예: 히어로/체크리스트/베네핏/근거/사용법/후기 등)
- goal: 이 섹션의 역할(짧은 한 문장)
- headline: 한국어 1줄(강하게)
- headline_en: headline의 자연스러운 영어 번역 1줄
- subheadline: 한국어 1줄(명확하게)
- subheadline_en: subheadline의 자연스러운 영어 번역 1줄
- bullets: 한국어 3개(스캔용, 각 1줄)
- bullets_en: bullets의 자연스러운 영어 번역 3개
- trust_or_objection_line: 한국어 불안 제거/신뢰 1문장
- trust_or_objection_line_en: trust_or_objection_line의 자연스러운 영어 번역 1문장
- CTA: 빈 문자열
- CTA_en: 빈 문자열
- layout_notes: 이미지 레이아웃 지시(짧게)
- compliance_notes: 카테고리별 규제/표현 주의(짧게)

# 섹션 구성 원칙(강제)
- 작성 전에 내부적으로 한 줄 판매 스레드를 먼저 고정할 것: 고객이 원하는 결과 → 지금 막는 불편 → 이 제품의 해결 메커니즘 → 구매해야 하는 구체적 이유. 전체 섹션은 이 스레드를 따라 하나의 판매 영화처럼 이어질 것.
- 각 섹션의 headline/subheadline은 앞 섹션의 감정·판단을 받아 다음 장면으로 넘기고, 같은 문구를 반복하지 말 것.
- 베네핏은 3개 고정
- **반론 섹션은 반드시 넣는다.** 살까 말까 망설이는 이유(가격, 나한테도 될까, 실패하면, 효과가 약하지 않을까)를 페이지가 먼저 꺼내 다루는 섹션이다. 좋은 점만 나열하면 읽는 사람은 속으로 반박하며 읽는다.
  강도를 세게 잡을수록 이 섹션을 빼기 쉬운데, 그때 이탈이 가장 크다. 표현을 강하게 하되 **섹션을 줄여서 강해지려 하지 않는다.**
- 근거 섹션은 반드시 결과→조건→해석 3단으로 작성
- 리뷰 섹션은 전/후 사진보다 사용감 문장 후기 카드 6~12개 우선
- 사용법/루틴은 선택지를 2~3개로 줄여 선택 피로를 없앨 것
- CTA 필드는 모든 섹션에서 빈 문자열로 둘 것. 통이미지는 링크를 걸 수 없어 눌리지 않는 그림 버튼이 되고, 텍스트편집 모드에서도 이 값을 쓰지 않는다. 실제 구매 버튼은 쇼핑몰이 붙인다(사용자 결정 2026-07-30).
- 각 섹션의 이미지는 단순한 제품 누끼나 그래픽이 아닌 소비자의 구매 전환을 유도할 수 있는 고품질 광고 사진 느낌으로 기획할 것
- 첫 번째 섹션은 구매 전환에 가장 중요하므로 반드시 매력적인 모델이 제품과 함께 연출된 컷으로 프롬프트를 작성할 것
- 각 섹션 이미지는 해당 헤드라인과 서브헤드라인의 메시지를 시각적으로 전달해야 함

# 카피 작성 원칙(강제)
- section_name은 내부 편집용 역할명이다. headline/subheadline/bullets/CTA에 "문제 제기", "가이드 소개", "신뢰 근거", "사용 장면" 같은 역할명을 그대로 쓰지 말 것.
- 모든 visible copy는 제작자에게 설명하는 문장이 아니라, 이미지·페이지에 그대로 들어가도 자연스러운 고객-facing 판매 문장이어야 함.
- 문제/공감 섹션은 고객이 실제로 겪는 상황형 문장이나 질문형 헤드라인으로 작성할 것.
- 금지 추상 문구(그대로 쓰지 말고, 제품 카테고리와 근거가 보이는 문장으로 다시 쓸 것): "불편은 늘 같은 순간에 다시 옵니다", "구매 전 디테일을 가까이에서 확인하세요", "필요한 순간을 놓치기 전에 확인하세요", "사용 후 일상이 조금 더 가벼워집니다", "미루면 같은 불편이 다시 남습니다".
- 후기 근거를 라벨로 쓰지 말 것("OO 인정 후기", "OO 적다는 후기" 금지). 그 장점 자체를 고객이 얻는 혜택 문장으로 다시 쓸 것. 업로드 제품에서 확인되지 않는 다른 카테고리의 기능·혜택을 새로 만들지 말 것.
- 근거 없는 효능·인증·수치·후기 개수를 만들지 말 것.
- 모든 섹션 CTA와 CTA_en은 빈 문자열로 두고, '구매하기/자세히 보기/지금 확인하기/클릭/버튼/>' 같은 링크·버튼 유도 문구를 visible copy에 쓰지 말 것.

# 섹션별 이미지 생성 프롬프트
- image_id: IMG_S1~IMG_S6
- purpose: 이 이미지가 전달해야 하는 메시지(짧은 한 문장)
- prompt_ko: 한국어 이미지 생성 프롬프트(1~2문장). 구도, 거리감, 시선 높이, 제품이 프레임에서 차지하는 비중을 함께 명시할 것.
- prompt_en: 영어 프롬프트(실제 이미지 생성용). Include composition, framing distance, camera angle, product prominence, and the key subject action. Keep it neutral enough that studio/lifestyle/outdoor priority can still be controlled at generation time.
- negative_prompt: 피해야 할 요소
${styleGuideFieldRule}
- reference_usage: 업로드된 기존 제품 이미지를 어떻게 참고할지. 제품 형태, 라벨, 재질, 색감을 유지하는 기준을 명시할 것.
- section_name, goal, layout_notes, compliance_notes, purpose, style_guide, reference_usage는 반드시 한국어로 작성할 것
- 영어는 *_en 필드와 prompt_en에만 사용할 것

# 이미지 생성 공통 규칙
- 세로형 상세페이지용
- ${
    outputMode === "full-image"
      ? "이미지 안에 들어갈 한국어 문구는 헤드라인 1개·보조문구 1개·포인트 카드 3개·작은 신뢰문구 1줄이다. 이 개수를 줄이지 말고, 대신 각 문구를 모바일에서도 크게 읽히도록 짧게 쓸 것. 카드·배너 안 모든 한글은 끝까지 보여야 하고(말줄임표·잘림 금지), 버튼·화살표·링크형 CTA는 만들지 말 것. 제품 브랜드/수치/효과는 원본 근거가 있을 때만 사용할 것"
      : "이미지 내에 텍스트, 로고, 워터마크, 글자를 넣지 말 것"
  }
- 배경은 단순하게 유지하고 제품/핵심 오브젝트에 시선을 집중시킬 것
- 한 장에 메시지 하나만 전달할 것
- 규제 리스크가 있으면 안전한 표현으로 수정할 것
- JSON 외 텍스트를 붙이지 말고 모든 필드는 간결하게 작성할 것

응답은 반드시 제공된 JSON 스키마를 준수해야 합니다.
`.trim();
}

export function buildImagePrompt(
  section: SectionBlueprint,
  desiredTone?: string,
  options?: InternalImageGenOptions
) {
  const baseSceneDirection = getBaseSceneDirection(section, options?.guidePriorityMode ?? "guide-first");
  let enhancedPrompt = "Create a high-end, conversion-optimized commercial advertising photograph. ";

  if (options?.headline) {
    enhancedPrompt += `Context: The image should visually represent the advertising headline "${options.headline}"`;
    if (options.subheadline) {
      enhancedPrompt += ` and subheadline "${options.subheadline}"`;
    }
    enhancedPrompt += ". ";
  }

  if (options?.withModel && options.referenceModelImageBase64) {
    enhancedPrompt +=
      "Reference Inputs: image 1 is the original product reference and must preserve the exact product. image 2 is the mandatory model identity reference. ";
    enhancedPrompt +=
      "The final image MUST use the same person from image 2. Do not switch to a different model, do not change gender, and do not drift to a generic portrait face. ";
    if (options.referenceModelProfile) {
      enhancedPrompt += buildReferenceModelProfilePrompt(options.referenceModelProfile);
    }
  }

  if (options?.isRegeneration) {
    enhancedPrompt += "\n[USER OVERRIDE INSTRUCTIONS - STRICTLY FOLLOW THESE OVER ANY CONFLICTING BASE INSTRUCTIONS]\n";
    enhancedPrompt += buildImageStyleInstructions(options);
    enhancedPrompt += "[END USER OVERRIDE INSTRUCTIONS]\n\n";
  } else {
    enhancedPrompt += "\nBase Instructions: ";
  }

  if (options?.withModel && options.referenceModelImageBase64) {
    enhancedPrompt +=
      `Using image 1 as the exact product reference and image 2 as the exact person reference, create a new commercial scene based on this direction: ${baseSceneDirection}. `;
    enhancedPrompt +=
      "The person in the final image must be the same person from image 2, with the same face, gender presentation, hairstyle, skin tone, and overall identity. ";
    enhancedPrompt +=
      "Do not replace the person with a different model, do not masculinize or feminize them differently, and do not drift to a generic fashion face. Treat this as the same person in a new pose, new framing, and new environment. ";
  } else {
    enhancedPrompt += `Keep the product exactly as is. Build the scene from this direction: ${baseSceneDirection}. `;
  }

  if (desiredTone) {
    enhancedPrompt += `The overall style and tone should be ${desiredTone}. `;
  }

  enhancedPrompt += buildGuidePriorityInstructions(section, options);

  if (!options?.isRegeneration) {
    enhancedPrompt += buildImagePreferenceInstructions(section, options);
  }

  if (options?.retryDirective) {
    enhancedPrompt += ` Retry correction: ${options.retryDirective} `;
  }

  enhancedPrompt += "\nComposition Rules: ";
  enhancedPrompt +=
    "use a varied, intentional camera distance that matches the scene instead of defaulting to a chest-up portrait. ";
  enhancedPrompt +=
    "Depending on the section, use wide shots, medium shots, tabletop/product detail shots, hands-in-frame moments, over-the-shoulder angles, seated scenes, or environment-led framing when they improve product storytelling. ";
  enhancedPrompt +=
    "Keep the product readable, prominent, and beautifully lit, but allow the frame to breathe with negative space, props, and surrounding context when useful. ";
  enhancedPrompt += "\nCRITICAL: The final image must look like a top-tier magazine advertisement or a premium brand's landing page hero shot. ";
  enhancedPrompt += "It should be highly attractive and induce purchase conversion. ";

  // 모드와 무관하게 항상 적용되는 아트 디렉션.
  // 특히 인물 국적은 withModel=true 일 때만 지시되고 있어서(buildModelDescriptor),
  // 모델 없이 장면만 그리는 경우 서양인이 기본으로 나왔다.
  enhancedPrompt += [
    "\nART DIRECTION (always applies):",
    "People: every person visible in the frame must be Korean, with natural Korean facial features, hair and styling, and the surroundings should read as Korea. This holds whether or not a reference model was supplied, and applies to hands, reflections and background figures too.",
    "Realism: this must read as a real photograph shot by a professional — natural skin texture with visible pores and fine hair, real fabric weave, honest depth of field, light that behaves physically. It must NOT look like a 3D render, CGI, an illustration, or a generic stock photo. Avoid waxy over-smoothed skin, plastic surfaces, symmetrical staged smiles, and the sterile evenly-lit look that gives AI images away.",
    "Creative direction: compose like an art director, not a template. Choose the crop, angle, eye level and subject placement that this specific message deserves — an extreme close-up, a wide environmental frame, an over-the-shoulder view, a top-down layout, or a low angle can all be right. A deliberate, slightly unexpected frame beats a safe centred one.",
    "Anti-template: do not fall back on the same safe arrangement every time. Vary composition, focal length and the position of the copy between sections so the page never feels like one layout repeated with different words. Rigid symmetrical boxes, evenly spaced icon rows and stock-template grids are failures.",
  ].join(" ");

  if (options?.outputMode === "full-image") {
    const onImageBullets = (section.bullets ?? []).filter(Boolean).slice(0, 2);
    enhancedPrompt += [
      "IMPORTANT: This is a complete Korean ecommerce detail-page section image, not a blank photo for later editing.",
      "Render a few clean, large, legible Korean typography elements directly inside the image using the provided copy, laid out as a polished 1080px mobile detail-page section (editorial grid, intentional margins, typographic hierarchy, accent rules, roomy callout cards or chips) — never plain text pasted over a generic photo.",
      "Mobile readability first: the copy must stay readable when a 1080px image is scaled down to a 390px phone. No long sentences, small body text, dense tables, or footer captions.",
      "Every visible Korean phrase must fit fully inside its card, badge, or banner. No ellipses, cropped letters, clipped line endings, or overflowing text. If a phrase will not fit, shorten it or drop the support card.",
      "Korean marketplace detail-page sections are static full images. Never draw fake clickable controls: no CTA buttons, no rounded button bars, no arrow buttons, no chevrons, and no phrases such as 제품 확인하기, 지금 확인하기, 구매하기, or 자세히 보기.",
      // 예전 규칙은 "한 가지 고딕, 굵기와 크기만 변경"이었다. 일관성은 지켜졌지만
      // 결과가 전부 밋밋한 고딕 덩어리로 나왔다. 위계·강조·팔레트를 명시해 편집 디자인처럼 만든다.
      "Typography hierarchy: build three clear levels. The headline must dominate the frame at roughly 2.5-3x the subheadline, in a heavy cut with tight letter-spacing; it may break to two or three lines and sit confidently close to the frame edge like an editorial poster.",
      "Emphasis is required: choose the one or two most important words in the headline and set them apart with the accent colour or a noticeably heavier and larger cut, so the eye lands there first. Never render an entire headline in one flat weight and one flat colour.",
      "Font pairing: use exactly two Korean typefaces — one distinctive face for the headline and one clean modern sans-serif (Pretendard or Noto Sans KR) for the support copy. The contrast between them is what makes it look designed rather than typed. Keep every Korean glyph correctly formed.",
      "Consistency lock: if the Style Guide names a page-wide design system (headline face, body face, palette, recurring cast), follow it exactly and do not substitute your own. These sections are generated one at a time but printed as one page — a different typeface or a different person between sections is a failure. When no system is given, choose one pairing and one palette and hold them for the whole frame.",
      "Palette lock: restrict the whole frame to three colours — background, text, and a single accent. Spend the accent only on the emphasis words, one small label chip, or a thin rule. Reuse the same three colours across every section.",
      "Editorial devices, used sparingly and only when they carry meaning: an oversized number, a solid colour block sitting behind a short phrase, a thin vertical accent bar beside a paragraph, a small uppercase label chip in a corner, and generous negative space. Fewer and larger always beats many and small.",
      "Composition: follow the Layout Notes for this section and commit to it. Do not default to the safe stack of a text block on top and a photo underneath every time — copy may overlay the image, sit in a side column, wrap around the subject, anchor to a bottom band, or run along a diagonal. The frame should feel composed, with the subject placed off-centre when that reads better.",
      "Brightness: unless this section is specifically about the customer's problem or pain, keep the frame bright, clean and optimistic — daylight or warm even light, a light or mid-tone background. Avoid gloom, heavy shadow and desaturated grey.",
      section.headline ? `On-image headline: ${section.headline}.` : "",
      section.subheadline ? `On-image subheadline: ${section.subheadline}.` : "",
      onImageBullets.length ? `On-image point cards (max 2, short benefit phrases): ${onImageBullets.join(" / ")}.` : ""
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    enhancedPrompt +=
      "IMPORTANT: Do NOT include any text, words, letters, typography, or logos in the generated image.";
  }

  return enhancedPrompt;
}

function buildImageStyleInstructions(options?: InternalImageGenOptions) {
  if (!options) {
    return "";
  }

  let instructions = "";

  if (options.style === "studio") {
    instructions +=
      "- Setting: Professional studio lighting, seamless paper or premium studio set, controlled backdrop, and no lived-in domestic context unless explicitly required.\n";
    instructions +=
      "- Composition: Avoid a default chest-up portrait. Prefer a mix of product-centric wide frames, half-body frames, seated or standing full-figure compositions, tabletop layouts, hand interactions, and close detail inserts depending on the section goal.\n";
    instructions +=
      "- Art Direction: Crisp controlled light, subtle shadows, refined color balance, and a clearly designed studio set that feels intentional rather than empty.\n";
    instructions += "- Scene Guardrail: If any lifestyle or outdoor guidance conflicts, keep the result unmistakably studio-led.\n";
  } else if (options.style === "lifestyle") {
    instructions +=
      "- Setting: Authentic, aspirational lifestyle environment with natural lighting, lived-in textures, and everyday context that feels believable.\n";
    instructions +=
      "- Composition: Use candid moments, on-location interaction, room context, hands using the product, and gentle movement. Vary distance between environmental wide shots, medium shots, and close usage details.\n";
    instructions +=
      "- Art Direction: Warm, human, relatable, and editorial, with enough context to explain why the product fits into daily life.\n";
    instructions += "- Scene Guardrail: Do not collapse the result into a blank studio set unless guide priority explicitly demands it.\n";
  } else if (options.style === "outdoor") {
    instructions +=
      "- Setting: Beautiful outdoor environment with cinematic natural lighting, location depth, airiness, and scene-based storytelling.\n";
    instructions +=
      "- Composition: Use wide scenic frames, dynamic movement, environmental close-ups, and product-in-use storytelling that feels active and open.\n";
    instructions +=
      "- Art Direction: Fresh, expansive, airy, and energetic, with the location helping explain the product mood or usage context.\n";
    instructions += "- Scene Guardrail: Keep the result clearly outdoors, not a studio imitation or an indoor lifestyle room.\n";
  }

  if (options.withModel) {
    if (options.referenceModelImageBase64) {
      instructions += "- Subject: MUST feature the exact same person shown in the attached reference model image.\n";
      instructions += "- Identity Lock: Preserve the face, hairstyle, skin tone, gender presentation, and overall appearance of that same person while adapting pose, styling, and composition to the scene.\n";
      instructions += "- Casting Rule: Never swap to another person. Never reinterpret the reference as a different male or female model.\n";
      if (options.referenceModelProfile) {
        instructions += `- Stable Traits: ${options.referenceModelProfile.keepTraits.join(", ")}.\n`;
        instructions += `- Flexible Traits: ${options.referenceModelProfile.flexibleTraits.join(", ")}.\n`;
      }
    } else {
      const modelDescriptor = buildModelDescriptor(options);
      instructions += `- Subject: MUST feature an attractive, professional model (${modelDescriptor}) posing with and interacting naturally with the product.\n`;
    }
  } else {
    instructions += "- Subject: Do NOT include any people or models. Focus entirely on the product and background.\n";
  }

  return instructions;
}

function buildImagePreferenceInstructions(section: SectionBlueprint, options?: InternalImageGenOptions) {
  if (!options) {
    return "";
  }

  const parts: string[] = [];

  if (options.style === "studio") {
    parts.push("Use a polished studio set with controlled light and flexible framing, not a fixed upper-body portrait.");
  } else if (options.style === "lifestyle") {
    parts.push("Use an authentic lifestyle setting with natural interaction and believable context.");
  } else if (options.style === "outdoor") {
    parts.push("Use an outdoor environment with scenic depth and active visual storytelling.");
  }

  if (options.withModel && options.referenceModelImageBase64) {
    parts.push("Use the attached reference model as the same person for this scene, with identity locked and no model swap.");
  } else if (options.withModel) {
    const modelDescriptor = buildModelDescriptor(options);
    parts.push(`If appropriate for the scene, feature a model (${modelDescriptor}).`);
  }

  parts.push("Keep the product central to the story and avoid collapsing the scene into a generic portrait.");
  parts.push(`Preserve the product using this guidance: ${section.reference_usage || "keep shape, material, color, and branding accurate."}`);

  return parts.length ? `Style Preferences: ${parts.join(" ")}` : "";
}

function buildModelDescriptor(options: ImageGenOptions) {
  const nationalityDescriptor = getModelCountryDescriptor(options.modelCountry);
  const ageDescriptor = getModelAgeDescriptor(options.modelAgeRange);
  const genderDescriptor = options.modelGender === "male" ? "man" : "woman";

  return `${nationalityDescriptor} ${genderDescriptor} ${ageDescriptor}`.trim();
}

function getModelCountryDescriptor(country?: ImageGenOptions["modelCountry"]) {
  if (country === "japan") {
    return "Japanese";
  }
  if (country === "usa") {
    return "American";
  }
  if (country === "france") {
    return "French";
  }
  if (country === "germany") {
    return "German";
  }
  if (country === "africa") {
    return "African";
  }

  return "Korean";
}

function getModelAgeDescriptor(ageRange?: ImageGenOptions["modelAgeRange"]) {
  if (ageRange === "teen") {
    return "in the late teens";
  }
  if (ageRange === "30s") {
    return "in the 30s";
  }
  if (ageRange === "40s") {
    return "in the 40s";
  }
  if (ageRange === "50s_plus") {
    return "in the 50s or older";
  }

  return "in the 20s";
}

function parseBlueprintResponse(response: { text?: string }) {
  try {
    const parsed = JSON.parse(extractResponseText(response)) as Partial<LandingPageBlueprint>;
    return sanitizeBlueprint(parsed);
  } catch (error) {
    throw new PdpServiceError(
      "AI_RESPONSE_INVALID",
      "AI 응답을 해석하지 못했습니다.",
      stringifyError(error)
    );
  }
}

function sanitizeBlueprint(input: Partial<LandingPageBlueprint>) {
  const sections = Array.isArray(input.sections)
    ? input.sections.map((section, index) => normalizeSection(section, index))
    : [];

  return {
    // 여기서 빠뜨리면 읽어낸 제품 사실이 조용히 사라진다. 필드를 하나씩 나열하는
    // 함수는 새 값을 삼킨다 — 이 저장소에서 이미 두 번 겪었다.
    productReading: normalizeProductReading(input.productReading),
    executiveSummary: asString(input.executiveSummary),
    scorecard: Array.isArray(input.scorecard)
      ? input.scorecard.map((item) => ({
          category: asString(item?.category),
          score: asString(item?.score),
          reason: asString(item?.reason)
        }))
      : [],
    blueprintList: Array.isArray(input.blueprintList)
      ? input.blueprintList.map((item) => asString(item)).filter(Boolean)
      : sections.map((section) => section.section_name),
    sections
  } satisfies LandingPageBlueprint;
}

function normalizeSection(section: Partial<SectionBlueprint>, index: number): SectionBlueprint {
  return {
    section_id: asString(section.section_id) || `S${index + 1}`,
    section_name: asString(section.section_name) || `섹션 ${index + 1}`,
    goal: asString(section.goal),
    headline: asString(section.headline),
    headline_en: asString(section.headline_en) || asString(section.headline),
    subheadline: asString(section.subheadline),
    subheadline_en: asString(section.subheadline_en) || asString(section.subheadline),
    bullets: Array.isArray(section.bullets) ? section.bullets.map((item) => asString(item)).filter(Boolean) : [],
    bullets_en: Array.isArray(section.bullets_en)
      ? section.bullets_en.map((item) => asString(item)).filter(Boolean)
      : Array.isArray(section.bullets)
        ? section.bullets.map((item) => asString(item)).filter(Boolean)
        : [],
    trust_or_objection_line: asString(section.trust_or_objection_line),
    trust_or_objection_line_en:
      asString(section.trust_or_objection_line_en) || asString(section.trust_or_objection_line),
    CTA: asString(section.CTA),
    CTA_en: asString(section.CTA_en) || asString(section.CTA),
    layout_notes: asString(section.layout_notes),
    compliance_notes: asString(section.compliance_notes),
    image_id: asString(section.image_id) || `IMG_S${index + 1}`,
    purpose: asString(section.purpose),
    prompt_ko: asString(section.prompt_ko),
    prompt_en: asString(section.prompt_en),
    negative_prompt: asString(section.negative_prompt),
    style_guide: asString(section.style_guide),
    reference_usage: asString(section.reference_usage),
    generatedImage: section.generatedImage
  };
}

/**
 * 기본값을 채운다.
 *
 * **필드를 하나씩 나열하지 않는다.** 그렇게 하면 새 옵션이 늘 때마다 여기에
 * 적어 주지 않으면 값이 조용히 사라진다. 실제로 그렇게 잃었다 —
 * `styleReferenceImages`·`preserveProductImage`·`characterReference` 세 개가
 * 목록에 없어서 **디자인 레퍼런스와 캐릭터가 한 번도 반영되지 않았다**(2026-07-30 발견).
 * 화면은 붙였다고 말하고, 엔진은 받지 못한 채 제품 앵커만 보냈다.
 *
 * 그래서 받은 것을 그대로 펼치고 기본값만 덮어쓴다.
 */
function normalizeImageOptions(
  options?: InternalImageGenOptionsInput,
): InternalImageGenOptions & { look: ImageLook; userInstruction: string } {
  return {
    ...options,
    // 안 고르면 사진이다. 여기서 기본을 정해야 이 함수를 거치는 모든 경로가
    // 같은 결로 간다 — 부르는 쪽마다 판단하면 언젠가 한 곳이 어긋난다.
    look: normalizeLook(options?.look),
    userInstruction: (options?.userInstruction ?? "").trim(),
    style: options?.style ?? "studio",
    withModel: options?.withModel ?? false,
    modelGender: options?.modelGender ?? "female",
    modelAgeRange: options?.modelAgeRange ?? "20s",
    modelCountry: options?.modelCountry ?? "korea",
    guidePriorityMode: options?.guidePriorityMode ?? "guide-first",
    referenceModelProfile: options?.referenceModelProfile ?? null,
  };
}

function buildReferenceModelProfilePrompt(profile: ReferenceModelProfile) {
  const stableTraits = uniqueStrings(profile.keepTraits).join(", ");
  const flexibleTraits = uniqueStrings(profile.flexibleTraits).join(", ");
  const distinctiveFeatures = uniqueStrings(profile.distinctiveFeatures).join(", ");

  return [
    "Reference identity profile:",
    `gender presentation ${profile.genderPresentation};`,
    `age impression ${profile.ageImpression};`,
    `face shape ${profile.faceShape};`,
    `hairstyle ${profile.hairstyle};`,
    `skin tone ${profile.skinTone};`,
    `eye details ${profile.eyeDetails};`,
    `brow details ${profile.browDetails};`,
    `lip details ${profile.lipDetails};`,
    `overall vibe ${profile.overallVibe}.`,
    stableTraits ? `Keep fixed: ${stableTraits}.` : "",
    distinctiveFeatures ? `Identifying markers: ${distinctiveFeatures}.` : "",
    flexibleTraits ? `May vary: ${flexibleTraits}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function buildGuidePriorityInstructions(section: SectionBlueprint, options?: InternalImageGenOptions) {
  const mode = options?.guidePriorityMode ?? "guide-first";

  if (mode === "guide-first") {
    return [
      "Design Guide Priority: ON.",
      `Image Purpose: ${section.purpose}.`,
      section.layout_notes ? `Layout Notes: ${section.layout_notes}.` : "",
      section.style_guide ? `Style Guide: ${section.style_guide}.` : "",
      "If the selected shot type and guide conflict, respect the guide first and use the shot type as a supporting constraint."
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "Design Guide Priority: OFF.",
    `Image Purpose: ${section.purpose}.`,
    "Ignore Layout Notes and Style Guide whenever they conflict with the selected shot type.",
    "Use the selected shot type as the main scene-defining instruction."
  ].join(" ");
}

function getBaseSceneDirection(section: SectionBlueprint, mode: PdpGuidePriorityMode) {
  if (mode === "guide-first") {
    return [section.prompt_en, section.layout_notes, section.style_guide, section.reference_usage]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Communicate this purpose clearly: ${section.purpose}.`,
    "Build a fresh scene from the selected shot type.",
    "Do not inherit conflicting layout or style-guide assumptions from the section metadata."
  ].join(" ");
}

function buildValidationPrompt(profile: ReferenceModelProfile, expectedStyle: NonNullable<ImageGenOptions["style"]>) {
  return `
You will compare two images.
- image 1: the uploaded reference person image
- image 2: the newly generated candidate image

Judge whether image 2 preserves the same identifiable person from image 1 while allowing new pose, styling, framing, and environment.

Reference person profile:
- gender presentation: ${profile.genderPresentation}
- age impression: ${profile.ageImpression}
- face shape: ${profile.faceShape}
- hairstyle: ${profile.hairstyle}
- skin tone: ${profile.skinTone}
- eye details: ${profile.eyeDetails}
- brow details: ${profile.browDetails}
- lip details: ${profile.lipDetails}
- overall vibe: ${profile.overallVibe}
- keep traits: ${profile.keepTraits.join(", ")}
- distinctive features: ${profile.distinctiveFeatures.join(", ")}

Expected shot type: ${getStyleLabel(expectedStyle)}.

Return JSON only with:
- isSamePerson: boolean
- genderPresentationPreserved: boolean
- styleMatch: boolean
- confidence: high | medium | low
- reason: short explanation
- correctionFocus: array of short phrases explaining what must be corrected
`.trim();
}

function buildRetryDirective(
  validation: GeneratedImageValidation,
  profile: ReferenceModelProfile,
  expectedStyle: NonNullable<ImageGenOptions["style"]>
) {
  return [
    `The previous attempt did not pass identity/style validation: ${validation.reason}.`,
    `Keep the same person using these fixed traits: ${uniqueStrings(profile.keepTraits).join(", ")}.`,
    `Preserve these identifying markers: ${uniqueStrings(profile.distinctiveFeatures).join(", ")}.`,
    validation.correctionFocus.length ? `Correct these issues: ${validation.correctionFocus.join(", ")}.` : "",
    `The retried image must clearly read as a ${getStyleLabel(expectedStyle)} scene.`
  ]
    .filter(Boolean)
    .join(" ");
}

function parseReferenceModelProfileResponse(response: { text?: string }) {
  try {
    const parsed = JSON.parse(extractResponseText(response)) as Partial<ReferenceModelProfile>;

    return {
      genderPresentation: asString(parsed.genderPresentation) || "same as reference image",
      ageImpression: asString(parsed.ageImpression) || "same age impression as reference image",
      faceShape: asString(parsed.faceShape) || "same face shape as reference image",
      hairstyle: asString(parsed.hairstyle) || "same hairstyle impression as reference image",
      skinTone: asString(parsed.skinTone) || "same skin tone as reference image",
      eyeDetails: asString(parsed.eyeDetails) || "same eye shape and gaze impression",
      browDetails: asString(parsed.browDetails) || "same brow shape and thickness",
      lipDetails: asString(parsed.lipDetails) || "same lip shape and expression impression",
      overallVibe: asString(parsed.overallVibe) || "same overall vibe as the reference person",
      distinctiveFeatures: asStringArray(parsed.distinctiveFeatures),
      keepTraits: asStringArray(parsed.keepTraits),
      flexibleTraits: asStringArray(parsed.flexibleTraits)
    } satisfies ReferenceModelProfile;
  } catch (error) {
    throw new PdpServiceError(
      "AI_RESPONSE_INVALID",
      "참조 모델 이미지를 해석하지 못했습니다.",
      stringifyError(error)
    );
  }
}

function parseGeneratedImageValidationResponse(response: { text?: string }) {
  try {
    const parsed = JSON.parse(extractResponseText(response)) as Partial<GeneratedImageValidation>;

    return {
      isSamePerson: Boolean(parsed.isSamePerson),
      genderPresentationPreserved: Boolean(parsed.genderPresentationPreserved),
      styleMatch: Boolean(parsed.styleMatch),
      confidence: parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low",
      reason: asString(parsed.reason) || "identity validation failed",
      correctionFocus: asStringArray(parsed.correctionFocus)
    } satisfies GeneratedImageValidation;
  } catch (error) {
    throw new PdpServiceError(
      "AI_RESPONSE_INVALID",
      "생성된 이미지 검증 응답을 해석하지 못했습니다.",
      stringifyError(error)
    );
  }
}

function extractResponseText(response: { text?: string }) {
  if (!response.text) {
    throw new PdpServiceError(
      "AI_RESPONSE_INVALID",
      "AI 응답이 비어 있습니다.",
      "provider returned no text."
    );
  }

  let text = response.text.trim();
  if (text.startsWith("```json")) {
    text = text.slice(7);
  } else if (text.startsWith("```")) {
    text = text.slice(3);
  }
  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }

  const normalized = text.trim().replace(/^\uFEFF/, "");
  const extractedJson = extractJsonCandidate(normalized);
  return extractedJson ?? normalized;
}

function extractJsonCandidate(input: string) {
  if (!input) {
    return null;
  }

  const objectStart = input.indexOf("{");
  const arrayStart = input.indexOf("[");
  const startIndexCandidates = [objectStart, arrayStart].filter((value) => value >= 0);

  if (!startIndexCandidates.length) {
    return null;
  }

  const startIndex = Math.min(...startIndexCandidates);

  for (let endIndex = input.length; endIndex > startIndex; endIndex -= 1) {
    const candidate = input.slice(startIndex, endIndex).trim();

    if (!candidate) {
      continue;
    }

    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function buildHighResolutionInlinePart(mimeType: string, data: string) {
  return {
    inlineData: {
      mimeType,
      data
    },
    mediaResolution: {
      level: "media_resolution_high"
    }
  } as any;
}

function getStyleLabel(style: NonNullable<ImageGenOptions["style"]>) {
  if (style === "lifestyle") {
    return "lifestyle shot";
  }
  if (style === "outdoor") {
    return "outdoor shot";
  }

  return "studio shot";
}

function normalizeReferenceModelImage(base64?: string, mimeType?: string) {
  if (!base64?.trim()) {
    return null;
  }

  if (!mimeType?.trim()) {
    throw new PdpServiceError(
      "INVALID_IMAGE_PAYLOAD",
      "모델 이미지 형식이 올바르지 않습니다.",
      "Reference model image is missing mime type."
    );
  }

  return {
    base64: sanitizeBase64Payload(base64),
    mimeType: normalizeMimeType(mimeType)
  };
}

function extractGeneratedImage(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
      }>;
    };
  }>;
}) {
  const parts = response.candidates?.[0]?.content?.parts ?? [];

  for (const part of parts) {
    if (part.inlineData?.data && part.inlineData.mimeType) {
      return {
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      };
    }
  }

  return null;
}

async function retryOperation<T>(operation: () => Promise<T>, retries = 2, delay = 1500): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (retries > 0 && (isQuotaError(message) || isJsonError(message))) {
      await wait(delay);
      return retryOperation(operation, retries - 1, delay * 2);
    }

    if (error instanceof PdpServiceError) {
      throw error;
    }

    if (isQuotaError(message)) {
      throw new PdpServiceError(
        "AI_QUOTA_EXCEEDED",
        "AI 사용량이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
        message
      );
    }

    if (isJsonError(message)) {
      throw new PdpServiceError(
        "AI_RESPONSE_INVALID",
        "AI 응답을 해석하지 못했습니다.",
        message
      );
    }

    throw error;
  }
}

function isQuotaError(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("429") || lowered.includes("quota") || lowered.includes("resource_exhausted");
}

function isInvalidApiKeyError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("api key not valid") ||
    lowered.includes("invalid api key") ||
    lowered.includes("api_key_invalid") ||
    lowered.includes("authentication credentials were not provided")
  );
}

function isPermissionError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("permission denied") ||
    lowered.includes("does not have permission") ||
    lowered.includes("forbidden") ||
    lowered.includes("model access") ||
    lowered.includes("not found for api version")
  );
}

function isJsonError(message: string) {
  return message.includes("JSON") || message.includes("Unexpected token") || message.includes("Unterminated string");
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function extractGoogleApiErrorMessage(rawText: string) {
  const trimmed = rawText.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: {
        message?: string;
        status?: string;
      };
    };
    const status = parsed.error?.status?.trim();
    const message = parsed.error?.message?.trim();
    return [status, message].filter(Boolean).join(": ");
  } catch {
    return trimmed;
  }
}

function toDataUrl(mimeType: string, base64: string) {
  return `data:${mimeType};base64,${base64}`;
}
