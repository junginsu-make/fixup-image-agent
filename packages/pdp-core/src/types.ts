import type { ImageLook } from "@fixup/shared";
import type { BlueprintReview } from "./pdp.review";
import type { ProductReading } from "./pdp.product-reading";
import type { SellerBrief } from "./pdp.seller-brief";

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
export type PdpImageStyle = "studio" | "lifestyle" | "outdoor";
export type PdpModelGender = "female" | "male";
export type PdpModelAgeRange = "teen" | "20s" | "30s" | "40s" | "50s_plus";
export type PdpModelCountry = "korea" | "japan" | "usa" | "france" | "germany" | "africa";
export type PdpCopyLanguage = "ko" | "en";
export type ReferenceModelUsage = "hero-only" | "all-sections";
export type PdpGuidePriorityMode = "guide-first" | "style-first";
export type PdpOutputMode = "editable" | "full-image";

export type CopyIntensity = "plain" | "normal" | "strong" | "max";
export type GapPolicy = "omit" | "ask" | "sample";

export type CopyTarget =
  | { slot: "headline" | "subheadline" | "trust_or_objection_line" | "CTA" | "prompt_ko" }
  | { slot: "bullet"; index: number };

export type EvidenceKind = "quoted" | "rhetoric" | "sample" | "user" | "ask";

export interface CopyEvidence {
  target: CopyTarget;
  value: string;
  kind: EvidenceKind;
  quote?: string;
  note?: string;
  acknowledgedAt?: string;
}

export interface ScorecardItem {
  category: string;
  score: string;
  reason: string;
}

// 풀이미지 QA 게이트: 생성된 이미지를 승인된 카피와 대조해 잡는 결함들.
export type QaDefectType =
  | "forbidden_brand" // 카피에 없는 브랜드/로고/워터마크
  | "text_typo" // 카피와 불일치하는 오타/깨진 글자
  | "unsupported_number" // 카피에 없는 수치/통계
  | "body_distortion" // 인체 왜곡
  // 참고 인물과 다른 사람. QA 모델이 내는 값이 아니라, 인물 검증이 시도를
  // 다 쓰고도 못 맞췄을 때 코드가 붙인다 — 그 사실을 실을 자리가 없어서
  // 다른 사람 얼굴이 나온 그림이 통과로 표시되어 나갔다.
  | "reference_person_mismatch";

export type QaSeverity = "critical" | "minor";

// text_typo 가 어느 카피 요소에서 나왔는지. headline/subheadline 오타는 blocking.
export type QaTextLocation = "headline" | "subheadline" | "bullet" | "other";

export interface QaDefect {
  type: QaDefectType;
  severity: QaSeverity; // 모델 제안값(관측·정렬용). 최종 blocking 판정은 코드가 강제.
  location?: QaTextLocation; // text_typo 전용.
  evidence: string; // 무엇이/어디서 보였는지 (한국어).
  correctionHint: string; // 재생성 시 교정 지시 (영어, 프롬프트에 삽입).
}

export interface SectionBlueprint {
  section_id: string;
  section_name: string;
  goal: string;
  headline: string;
  headline_en: string;
  subheadline: string;
  subheadline_en: string;
  bullets: string[];
  bullets_en: string[];
  trust_or_objection_line: string;
  trust_or_objection_line_en: string;
  CTA: string;
  CTA_en: string;
  layout_notes: string;
  compliance_notes: string;
  image_id: string;
  purpose: string;
  prompt_ko: string;
  prompt_en: string;
  negative_prompt: string;
  style_guide: string;
  reference_usage: string;
  generatedImage?: string;
  qaWarnings?: QaDefect[]; // analyze 첫 이미지의 QA 결함(경고로 표기, blueprint는 보존).
  /** 글기반 생성의 근거 스키마. 없으면 이 기능 도입 전 구성안이다. */
  evidenceVersion?: 1;
  evidence?: CopyEvidence[];
}

/**
 * 페이지 전체가 공유하는 디자인 규칙. 시나리오 단계에서 한 번 정한다.
 *
 * 섹션 이미지는 서로를 모른 채 각각 생성되고, 앵커 이미지에는 글자가 없어
 * 폰트를 전달할 수 없다. 그래서 여기서 정한 값을 모든 섹션의 style_guide 에
 * 실어 보내 폰트·색·등장인물을 맞춘다.
 */
export interface DesignSystem {
  headlineFont: string;
  bodyFont: string;
  palette: string[];
  cast: string; // 페이지에 반복 등장하는 인물 묘사
}

export interface LandingPageBlueprint {
  /**
   * 사진에서 읽어낸 제품 사실. 카피는 여기 적힌 것만 근거로 쓴다
   * (→ `pdp.product-reading.ts`).
   *
   * 선택 필드다 — 저장해 둔 초안과 텍스트 시작 경로에는 없다.
   */
  productReading?: ProductReading;
  executiveSummary: string;
  scorecard: ScorecardItem[];
  blueprintList: string[];
  sections: SectionBlueprint[];
  designSystem?: DesignSystem;
}

export interface GeneratedResult {
  originalImage: string;
  blueprint: LandingPageBlueprint;
  /**
   * 구성안 심사 결과. 선택 필드다 — 심사가 실패하면 없이 진행한다.
   * 저장해 둔 초안에도 없다.
   */
  review?: BlueprintReview;
}

// ── 이미지 생성 모델 ─────────────────────────────────────────────
// 생성은 fal.ai 를 경유한다. 모델마다 입력 규격이 달라 어댑터가 흡수한다.

export type ImageModelId =
  | "gpt-image-2"
  | "nano-banana-pro"
  | "nano-banana-2"
  | "nano-banana"
  | "seedream-5-pro"
  | "qwen-image-2-pro";

export const DEFAULT_IMAGE_MODEL: ImageModelId = "gpt-image-2";

/**
 * 크레딧 가중치. 원가가 4.6배까지 벌어져 1장=1크레딧으로 두면
 * 모두가 가장 비싼 모델을 골라 원가만 뛴다.
 * 원가: $0.178 / $0.150 / $0.039 (fal, 9:16, 2026-07-27)
 */
export const IMAGE_MODEL_CREDIT_WEIGHT: Record<ImageModelId, number> = {
  "gpt-image-2": 4,
  "nano-banana-pro": 3,
  "nano-banana-2": 2,
  "nano-banana": 1,
  // $0.0675(1536 이하) — Nano Banana Pro 의 절반 아래다.
  "seedream-5-pro": 2,
  "qwen-image-2-pro": 2,
};

/**
 * 화면에 그대로 노출하는 안내.
 * 소요 시간은 6장 동시 배치 실측값이다. 추정이 아니다.
 *   GPT Image 2       288초 — 6장 중 5장 성공, 1장 QA 탈락
 *   Nano Banana Pro   112초 — 6장 전부 성공
 * fal 이 동시 요청을 완전 병렬로 처리하지 않아 장당 시간 × 1 보다 오래 걸린다.
 */
export interface ImageModelInfo {
  id: ImageModelId;
  label: string;
  description: string;
  creditWeight: number;
  /** 한 묶음(maxBatchSize 장) 예상 소요(초). 진행 안내에 그대로 쓴다. */
  expectedBatchSeconds: number;
  /**
   * 한 번의 요청에 묶을 수 있는 최대 장수.
   *
   * 서버리스 함수 상한이 300초다. GPT 는 6장에 288초가 걸려 상한에 12초밖에
   * 남지 않으므로 3장씩 나눈다. 나머지 둘은 6장이어도 절반 아래다.
   * 총 소요는 같고, 대신 묶음이 끝날 때마다 실제 진행률을 보여줄 수 있다.
   */
  maxBatchSize: number;
  /**
   * 한 요청에 함께 보낼 수 있는 최대 참조 장수.
   *
   * 넘겨서 보내면 fal 이 거절하거나 뒤쪽을 조용히 버린다. 어느 쪽이든
   * 사용자는 붙인 그림이 왜 반영이 안 됐는지 알 수 없다.
   *
   * 값은 sns-core 의 같은 목록과 맞춘다 — 같은 모델을 두 곳에서 다르게
   * 알고 있으면 한쪽 화면에서만 실패한다.
   */
  maxReferenceImages: number;
  /**
   * 캐릭터 화면에서만 보인다.
   *
   * 상세페이지는 섹션 이미지 품질을 실측으로 맞춰 왔다. 검증 안 된 모델을
   * 그 목록에 바로 넣으면 어느 모델로 만든 페이지인지 뒤섞인다. 캐릭터에서
   * 먼저 비교하고, 나은 것이 확인되면 그때 푼다.
   */
  characterOnly?: boolean;
}

export const IMAGE_MODELS: ImageModelInfo[] = [
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    description:
      "글자를 가장 정확하게 그립니다. 명조체 같은 섬세한 서체도 표현됩니다. 6장에 약 5분으로 가장 오래 걸립니다.",
    creditWeight: 4,
    // 6장 288초를 절반으로 나눈 값. 총 소요는 같다.
    expectedBatchSeconds: 150,
    maxBatchSize: 3,
    maxReferenceImages: 16,
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    description: "6장에 약 2분으로 빠릅니다. 글자는 고딕 계열만 나옵니다.",
    creditWeight: 3,
    expectedBatchSeconds: 120,
    maxBatchSize: 6,
    maxReferenceImages: 14,
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    description: "Pro 보다 빠르고 저렴합니다. 비율을 15종까지 받습니다.",
    creditWeight: 2,
    expectedBatchSeconds: 100,
    maxBatchSize: 6,
    maxReferenceImages: 14,
  },
  {
    id: "nano-banana",
    label: "Nano Banana",
    description: "가장 저렴합니다. 글자가 적은 단순한 장면에 적합합니다.",
    creditWeight: 1,
    expectedBatchSeconds: 90,
    maxBatchSize: 6,
    maxReferenceImages: 7,
  },
  {
    id: "seedream-5-pro",
    label: "Seedream 5.0 Pro",
    description:
      "여러 참조를 놓고 같은 대상을 유지하는 데 맞춰진 모델입니다. 참조는 10장까지. " +
      "참조를 넣으면 한 장에 90초 넘게 걸립니다.",
    creditWeight: 2,
    // 실측: edit 95초. 한 묶음에 여러 장을 넣으면 상한 300초에 걸린다.
    expectedBatchSeconds: 100,
    maxBatchSize: 2,
    maxReferenceImages: 10,
    characterOnly: true,
  },
  {
    id: "qwen-image-2-pro",
    label: "Qwen Image 2.0 Pro",
    description: "화풍을 옮기는 데 강합니다. 애니·일러스트에 씁니다. 13~18초로 빠릅니다.",
    creditWeight: 2,
    expectedBatchSeconds: 40,
    maxBatchSize: 6,
    maxReferenceImages: 10,
    characterOnly: true,
  },
];

/** 생성에 함께 넣는 참조 이미지. 종류에 따라 처리가 갈린다. */
export interface ReferenceImage {
  kind: "anchor" | "person" | "style";
  /**
   * 사용자가 **이 그림에 대해** 직접 적은 말.
   *
   * 있으면 이 자리의 고정 문구를 대신한다(설계 4-1 A안). 자리마다 따로 받으므로
   * 레퍼런스에 적은 말이 제품 지키기를 풀지 않는다.
   */
  intent?: string;
  base64: string;
  mimeType: string;
  /**
   * 디자인 레퍼런스가 **디자인 언어를 어떻게 쓰는지** 적은 서술. `style` 에만 쓴다.
   *
   * 이미지만 보내면 모델이 색을 글자색으로만 쓰고 면으로는 쓰지 않는다 —
   * 실측으로 확인했다(→ `pdp.reference-policy.ts`). 제품·인물의 정체성은 이미지가
   * 지키므로 서술이 필요 없지만, **색과 면의 쓰임새는 문장이 있어야 전달된다.**
   */
  description?: string;
}

export interface ImageGenOptions {
  style: PdpImageStyle;
  withModel: boolean;
  modelGender?: PdpModelGender;
  modelAgeRange?: PdpModelAgeRange;
  modelCountry?: PdpModelCountry;
  guidePriorityMode?: PdpGuidePriorityMode;
  headline?: string;
  subheadline?: string;
  isRegeneration?: boolean;
  referenceModelImageBase64?: string;
  referenceModelImageMimeType?: string;
  referenceModelImageFileName?: string;
  // "full-image": AI가 한국어 카피를 이미지에 직접 렌더한 완성형 섹션을 만든다.
  // "editable"(기본): 텍스트 없는 이미지 — 카피는 편집기에서 오버레이로 얹는다.
  outputMode?: PdpOutputMode;
  /** 사용할 이미지 모델. 비우면 DEFAULT_IMAGE_MODEL. */
  imageModel?: ImageModelId;
  /** 헤드라인에서 강조할 단어. 지정하면 그 단어만 강조색으로 나온다. */
  emphasisWords?: string[];
  /**
   * 페이지의 디자인 언어를 정하는 참조 이미지. 페이지당 한 장을 모든 섹션이 공유한다.
   *
   * 이미지는 fal 로 **원본 그대로** 간다(`image_urls`). `description` 은 프롬프트에
   * 싣지 않는다 — 요약하면 정보가 줄고, 틀린 요약은 정답 이미지를 두고 모델을
   * 잘못 이끈다. 무엇을 가져갈지는 `pdp.reference-policy.ts` 의 역할 지시문이 정한다.
   * `description` 은 레퍼런스 자동 추천에만 쓰인다.
   */
  styleReferenceImages?: Array<{ base64: string; mimeType: string; description?: string }>;
  /**
   * 제품 이미지를 지킬 것인가.
   *
   * 켜면 앵커(기준 이미지)를 함께 보내 섹션마다 같은 상품이 나온다. 대신
   * 스타일 레퍼런스가 일부만 반영된다 — 참조가 둘이면 모델이 절충한다.
   * 끄면 레퍼런스만 보내 디자인을 온전히 받되 상품 형태가 흔들릴 수 있다.
   * 스타일 레퍼런스가 없으면 이 값과 무관하게 앵커를 보낸다.
   */
  preserveProductImage?: boolean;
  /**
   * 이 페이지에 고정할 인물. 섹션 구성에 맞는 각도 한 장만 넣는다 —
   * 3종을 다 보내면 참조가 늘어 서로를 희석시킨다.
   */
  characterReference?: { base64: string; mimeType: string; identityPrompt: string };
  /**
   * 그림의 결. 안 고르면 `photoreal` — 상세페이지는 지금까지 늘 사진이었다.
   *
   * 값은 JSON 으로 들어오므로 문자열도 받는다. 아는 값인지는 pdp.service 의
   * `normalizeImageOptions` 가 경계에서 확인한다.
   */
  look?: ImageLook | string;
  /** 사용자가 직접 친 지시. 프롬프트 양끝에 놓여 다른 모든 지시보다 앞선다. */
  userInstruction?: string;
  /**
   * 첨부마다 「이 그림을 어떻게 쓸까요」에 적은 말. 자리 이름이 열쇠다.
   *
   * 적은 자리의 고정 문구만 빠진다(설계 4-1 A안). 레퍼런스에 적었다고 제품
   * 지키기가 풀리지 않는다 — 자리마다 따로 받는 이유다.
   */
  attachmentIntents?: AttachmentIntents;
}

/** 첨부 자리별 지시. `ReferenceImage["kind"]` 와 같은 이름을 쓴다. */
export type AttachmentIntents = Partial<Record<ReferenceImage["kind"], string>>;

// ── 텍스트 기반 진입 ─────────────────────────────────────────────
// 이미지 없이 자유 텍스트로 시작하는 경로. 주 대상은 무형 상품·서비스라
// "제품 컷" 개념이 없고, 섹션 이미지의 앵커는 별도로 생성하는 대표 이미지다.

export type OfferingKind =
  | "course"
  | "coaching"
  | "subscription"
  | "software"
  | "community"
  | "other";

/** 자유 텍스트에서 뽑아낸 판매 브리프. 시나리오 생성의 입력이 된다. */
export interface ProductBrief {
  offeringName: string;
  offeringKind: OfferingKind;
  oneLiner: string;
  audience: string; // 누구에게
  problem: string; // 어떤 문제를
  outcome: string; // 어떤 결과로
  differentiators: string[]; // 왜 이것이어야 하는가
  objections: string[]; // 예상 반론
  pricePositioning: string; // 가격·포지션 (입력에 없으면 추정값)
  tone: string;
  // 되묻지 않고 진행하므로, AI가 지어낸 부분은 반드시 사용자에게 보여준다.
  assumptions: string[];
  sourceText: string; // 사용자 원문 보존
}

export interface TextPlanRequest {
  text: string;
  aspectRatio: AspectRatio;
  desiredTone?: string;
  outputMode?: PdpOutputMode;
  copyIntensity?: CopyIntensity;
  gapPolicy?: GapPolicy;
}

export interface TextPlanResult {
  brief: ProductBrief;
  blueprint: LandingPageBlueprint;
  /**
   * 구성안 심사 결과. 심사 자체가 실패하면 비어 있다(생성은 살린다).
   * 끝까지 남은 지적도 그대로 담는다 — 통과한 척하지 않는다.
   */
  review?: BlueprintReview;
  /**
   * 이 페이지의 디자인 언어를 정할 참조 이미지. 없을 수 있다 —
   * 어울리는 것이 없으면 억지로 씌우지 않는다.
   */
  styleReference?: {
    id: string;
    name: string;
    description: string;
    imageBase64: string;
    mimeType: string;
    /** 왜 이것을 골랐는지. 화면에 그대로 보여준다. */
    reason: string;
  };
}

export interface TextPlanSuccessResponse {
  ok: true;
  result: TextPlanResult;
}

/** 대표 이미지(스타일 앵커). outputMode와 무관하게 항상 텍스트 없이 생성한다. */
export interface KeyVisualRequest {
  brief: ProductBrief;
  blueprint: LandingPageBlueprint;
  aspectRatio: AspectRatio;
  imageModel?: ImageModelId;
}

export interface KeyVisualSuccessResponse {
  ok: true;
  imageBase64: string;
  mimeType: string;
}

export interface PdpAnalyzeRequest {
  /**
   * 파는 사람만 아는 것. 전부 선택 입력이다 (→ `pdp.seller-brief.ts`).
   * 사진으로는 대상·불편·차별점을 알 수 없어서 받는다.
   */
  sellerBrief?: SellerBrief;
  /** 표현 강도. 텍스트 경로와 같은 손잡이다. */
  copyIntensity?: CopyIntensity;
  /** 근거가 없는 자리를 어떻게 할 것인가. */
  gapPolicy?: GapPolicy;
  imageBase64: string;
  mimeType: string;
  modelImageBase64?: string;
  modelImageMimeType?: string;
  modelImageFileName?: string;
  /**
   * 디자인 레퍼런스. **구성안을 짤 때부터 본다.**
   *
   * 전에는 이미지를 만들 때 처음 등장했다. 그래서 구성안의 `style_guide` 를
   * 기획이 상상으로 채웠고, 그 값이 그대로 이미지 프롬프트의 `design_system`
   * 이 됐다 — 레퍼런스를 붙여 놓고도 구성이 그것과 무관하게 짜였다.
   *
   * 열쇠 이름은 화면이 들고 있는 것과 같다. 옮겨 적으면 언젠가 어긋난다.
   */
  styleReference?: {
    imageBase64: string;
    mimeType: string;
    /** 디자인 언어를 어떻게 쓰는지 적은 서술. 레퍼런스를 등록할 때 만들어진다. */
    description?: string;
    /** 사용자가 그 그림에 대해 적은 「어떻게 쓸까요」. */
    intent?: string;
  };
  additionalInfo?: string;
  desiredTone?: string;
  aspectRatio: AspectRatio;
  outputMode?: PdpOutputMode;
  imageModel?: ImageModelId;
}

export interface PdpAnalyzeSuccessResponse {
  ok: true;
  result: GeneratedResult;
}

/**
 * 화면이 그물 너머로 보내는 옵션.
 *
 * **완성된 옵션과 들어오는 옵션은 다른 물건이다.** 화면은 `style`·`withModel` 을
 * 빼고 보낼 수 있고, 빠진 칸은 `normalizeImageOptions` 가 경계에서 채운다.
 * 전에는 이 둘을 같은 타입으로 두고 라우트에서 `as` 로 눌렀다 — 그러면 진짜
 * 어긋남도 함께 눌린다.
 */
export type ImageGenOptionsInput = Partial<ImageGenOptions>;

export interface PdpGenerateImageRequest {
  originalImageBase64: string;
  section: SectionBlueprint;
  aspectRatio: AspectRatio;
  desiredTone?: string;
  options?: ImageGenOptionsInput;
}

export interface PdpGenerateImageSuccessResponse {
  ok: true;
  imageBase64: string;
  mimeType: string;
  qa?: { warnings: QaDefect[] };
}

export interface PdpValidateApiKeySuccessResponse {
  ok: true;
  message: string;
  analyzeModel: string;
  imageModel: string;
}

export type PdpErrorCode =
  | "AI_KEY_MISSING"
  | "AI_KEY_INVALID"
  | "AI_MODEL_ACCESS_DENIED"
  | "INVALID_IMAGE_PAYLOAD"
  | "INVALID_REQUEST"
  | "AI_QUOTA_EXCEEDED"
  | "AI_RESPONSE_INVALID"
  | "PDP_ANALYZE_FAILED"
  | "PDP_IMAGE_GENERATION_FAILED"
  | "PDP_IMAGE_QA_REJECTED"
  // 텍스트 진입에서 "무엇을 파는지" 자체를 판독하지 못한 경우에만 쓴다.
  // 정보가 얇은 것은 실패가 아니다 — assumptions로 채워 진행한다.
  | "TEXT_INPUT_INSUFFICIENT";

export interface PdpErrorResponse {
  ok: false;
  code: PdpErrorCode;
  message: string;
  detail?: string;
}

export type TextPlanResponse = TextPlanSuccessResponse | PdpErrorResponse;
export type KeyVisualResponse = KeyVisualSuccessResponse | PdpErrorResponse;
export type PdpAnalyzeResponse = PdpAnalyzeSuccessResponse | PdpErrorResponse;
export type PdpGenerateImageResponse = PdpGenerateImageSuccessResponse | PdpErrorResponse;
export type PdpValidateApiKeyResponse = PdpValidateApiKeySuccessResponse | PdpErrorResponse;
