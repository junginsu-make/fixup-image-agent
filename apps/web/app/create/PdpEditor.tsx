"use client";
import { useCreditPolicy, useCreditUnit } from "../_components/credit-policy-provider";

import type { CSSProperties, MouseEvent as ReactMouseEvent, Dispatch, SetStateAction } from "react";
import { createSectionFor } from "./scenario-sections";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewedLayer, type LayerPreview } from "./layer-preview";
import { batchRetryKeyId } from "./batch-retry-key";
import { shouldRecoverAfter } from "./job-recovery";
import type { RecoveredFailureLine } from "./recovered-failures";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import {
  libraryVersionKey,
  libraryWorkId,
  pendingLibraryUpload,
  requestBatches,
  type LibraryUploadProgress,
} from "./library-save";
import { stitchLayout } from "./stitch-layout";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Globe2,
  Image as ImageIcon,
  Loader2,
  Palette,
  RefreshCw,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Type,
  User,
} from "lucide-react";
import { Rnd } from "react-rnd";
import { imageRequestLengthBlock } from "./image-request-length";
import type {
  AspectRatio,
  BlueprintReview,
  DesignSystem,
  GeneratedResult,
  ImageGenOptions,
  PdpCopyLanguage,
  PdpGenerateImageResponse,
  PdpOutputMode,
  PersonSource,
  ReferenceModelUsage,
  QaDefect,
  SectionBlueprint,
} from "@fixup/pdp-core";
import { MAX_PLANNED_SECTIONS, isBlockingDefect } from "@fixup/pdp-core";
import type {
  CanvasLayer,
  FloatingWorkbenchState,
  OverlayTextAlign,
  PdpEditorDraftState,
  PreparedImageDraft,
  ShapeLayer,
  TextOverlay,
  WorkbenchTab,
} from "./pdp-drafts";
import { Badge, Button, StepBar, cn } from "@fixup/ui";
import type { ImageLook } from "@fixup/shared";
import styles from "./pdp-maker.module.css";

/* 캔버스 위 도크 버튼. 상태 클래스를 기본과 분리해 둔다. */
const dockButtonClass =
  "inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground shadow-[var(--shadow-ring)] transition-colors hover:bg-muted";
const dockButtonActiveClass =
  "bg-primary text-primary-foreground shadow-none hover:bg-primary";
import { apiJson, toDataUrl } from "./pdp-utils";
import { buildSectionKeys } from "./pdp-drafts";
import { SectionGallery } from "./SectionGallery";
import { EmphasisWordPicker } from "./EmphasisWordPicker";
import { keepWordsPresentIn } from "./emphasis-words";
import { COPY_SLOTS, overlayStyleFor, type CopyOverlayType } from "./copy-slots";
import { CREATE_STEPS, type CreateMode } from "./create-steps";
import { ReviewPanel } from "./ReviewPanel";
import { ScorecardPanel } from "./ScorecardPanel";
import {
  chunkForModel,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
} from "@fixup/pdp-core";
import type { AttachmentIntents, ImageModelId, PageImageWire } from "@fixup/pdp-core";
// **서버가 차감할 때 쓰는 그 함수다.** 화면이 정수 가중치로 따로 세던 동안,
// gpt-image-2 여섯 장이면 서버는 27장을 깎는데 화면은 24장이라고 안내했다.
import { imageCreditUnits } from "../../lib/credit-cost";
import { buildPageWire } from "./page-wire";
import { IMAGE_STALE_NOTICE, conceptOnlyNotice, imageStampOf, isImageStale } from "@fixup/pdp-core";
import { describeBatchRun } from "./generation-run";
import { blobToBase64, exportFileName, exportScaleFor, mimeTypeOfDataUrl, needsRecomposite } from "./export-fidelity";
import { alignedWidthFor, canvasFitFor, canvasHeightFor, nextLayerOrigin } from "./layer-coords";
import { restoreSectionKeys } from "./section-keys-restore";
import { applyToSectionByKey } from "./section-result";
import { jobRequestFields } from "./job-recovery";
import {
  ALIGN_OPTIONS,
  BASIC_SOLID_COLORS,
  DEFAULT_FONT_FAMILY,
  FONT_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  MODEL_AGE_OPTIONS,
  MODEL_COUNTRY_OPTIONS,
  MODEL_GENDER_OPTIONS,
  STYLE_OPTIONS,
} from "./editor-options";
import { ElapsedTime } from "../_components/elapsed-time";
import { SaveImagesToLibrary } from "../_components/save-to-library";
import {
  applyLanguageToTextOverlay,
  buildExportNode,
  loadImage,
  buildOverlayBackgroundStyle,
  buildOverlayShellStyle,
  buildOverlayTextStyle,
  buildShapeLayerStyle,
  clampValue,
  downloadBlob,
  estimateOverlayBox,
  extractImageColorRecommendations,
  formatSavedAt,
  getDisplaySectionGoal,
  getDisplaySectionName,
  getLocalizedBullets,
  getLocalizedCopy,
  getModelAgeLabel,
  getModelCountryLabel,
  getModelGenderLabel,
  isShapeLayer,
  isTextLayer,
  normalizeCanvasLayer,
  normalizeImageOptions,
  normalizeOverlayRecord,
  normalizeSectionCopyFields,
  normalizeSectionOptions,
  normalizeShapeLayer,
  normalizeTextOverlay,
  sortColorsByContrast,
  toNumericSize,
  uniqueColors,
  DEFAULT_COLOR_RECOMMENDATIONS,
} from "./pdp-canvas-utils";
import type {
  ImageColorRecommendations,
} from "./pdp-canvas-utils";
import { randomId } from "../../lib/browser-safe";
import { pdpProcessSource } from "../api/library/work-process";

/** 도구 막대 단추. 테두리·바탕·14px 로 막대인 것이 한눈에 보이게 한다. */
const toolbarButtonClass = "h-9 gap-1.5 bg-background px-3 text-sm font-semibold text-foreground";

interface PdpEditorProps {
  initialResult: GeneratedResult;
  /**
   * 이 작업의 초안 id. 생성 결과를 서버에 적을 때 **무엇의 것인지** 묶는 값이다.
   *
   * 아직 저장 안 한 작업은 `null` 이다 — 그때는 서버가 예약 식별자로 대신하고
   * 그 요청 한 건만 묶인다(`job-recovery.ts`).
   */
  draftId?: string | null;
  /** 텍스트 경로의 구성안 심사 결과. 있으면 자기채점 점수표 대신 이것을 보여준다. */
  review?: BlueprintReview;
  /**
   * 페이지 공용 디자인. 여기서 섹션을 더할 때도 **같은 것을 물려준다**(U-15).
   *
   * 없으면 새 섹션만 다른 서체·다른 인물로 만들어지고, 그 사실은 이미지가
   * 나온 뒤에야 보인다.
   */
  designSystem?: DesignSystem;
  /** 이 페이지의 디자인 언어를 정하는 참조 이미지. 모든 섹션이 같은 것을 쓴다. */
  styleReference?: { imageBase64: string; mimeType: string; description?: string };
  /** 제품 이미지를 지킬 것인가. 레퍼런스가 있을 때만 의미가 있다. */
  preserveProduct?: boolean;
  /**
   * 인물 사진과 저장 캐릭터를 **둘 다 골랐을 때** 누구를 쓸 것인가(U-04).
   * 구성안 화면에서 사용자가 고른다.
   */
  personSource?: PersonSource;
  /** 이 페이지에 고정할 인물. 섹션마다 맞는 각도가 자동으로 들어간다. */
  characterId?: string;
  /**
   * 고른 각도. 비어 있으면 자동 — 서버가 섹션 설명에 맞춰 한 장 고른다.
   *
   * `characterId` 와 **따로 흐른다.** 한 덩어리로 묶으면 캐릭터만 바꾸는 자리마다
   * 각도를 함께 신경 써야 한다.
   */
  characterAngles: string[];
  aspectRatio: AspectRatio;
  outputMode?: PdpOutputMode;
  /** 그림의 결. 상세페이지의 기본은 photoreal — 지금까지 늘 사진이었다. */
  look?: ImageLook;
  /** 사용자가 직접 친 지시. 프롬프트 양끝에 놓여 다른 모든 지시보다 앞선다. */
  userInstruction?: string;
  // 단계 표시줄은 4단계를 모두 그리므로 1·2단계 라벨도 계속 보인다.
  // 텍스트로 시작한 작업에 "이미지 업로드"가 뜨지 않게 시작 방식을 넘겨받는다.
  startMode?: CreateMode;
  /**
   * 파는 것이 무엇인가(N-2, 설계 §9.1).
   *
   * **사진 없이 실물을 팔 때**를 가리기 위해 필요하다. 글로만 「나무 도마를
   * 팝니다」라고 적으면 우리는 나무 도마를 **지어내고**, 그 그림에는 실제로
   * 파는 물건과 다른 결·색·모양이 그려진다.
   */
  productKind?: string;
  /** 텍스트 경로에서 고른 이미지 모델. 섹션 생성에 그대로 쓴다. */
  imageModel?: ImageModelId;
  desiredTone: string;
  initialDraftState?: PdpEditorDraftState | null;
  /**
   * 서버에 남아 있던 그림을 되찾았다는 한마디(K-04).
   *
   * **말없이 바꾸면 배신이다.** 없던 그림이 갑자기 들어와 있으면 사용자는
   * 자기가 만든 것인지 아닌지 가릴 수 없다. 무엇을 되찾을지 고르는 판단은
   * 부모가 하고(`job-recovery.ts`), 여기서는 그 말을 보여 주기만 한다.
   */
  recoveredNotice?: string;
  /**
   * 안 만들어진 장과 그 까닭(F-7-8).
   *
   * 무엇을 보여 줄지 고르는 판단은 화면 밖에 있다(`recovered-failures.ts`).
   * 여기서는 받은 줄을 그린다.
   */
  recoveredFailures?: RecoveredFailureLine[];
  /**
   * 같은 요청이 **중복으로 막혔다**(K-05).
   *
   * 그 식별자로 이미 만들어진 것이 서버에 있을 수 있다. 부모가 되찾으러
   * 간다 — 여기서는 「막혔다」는 사실만 알린다.
   *
   * **일괄과 단건이 막히는 사정이 다르다.** 일괄은 같은 묶음을 다시 누를 때
   * 같은 열쇠가 가서 막힌다. 단건은 응답을 받으면 열쇠를 놓으므로
   * (`delete retryRequestKeysRef.current[sectionKey]`), **던져서 catch 로
   * 빠진 뒤 다시 누른 경우**에만 막힌다. 그래도 부를 값어치는 있다 —
   * 되찾기는 요청 식별자가 아니라 문서 번호로 찾으므로 앞선 묶음이 남긴
   * 작업을 찾아 빈 섹션을 채울 수 있다.
   */
  onDuplicateRequest?: () => void;
  lastSavedAt?: string | null;
  manualSaveToastToken?: number;
  onOpenSettings?: () => void;
  onReset: () => void;
  onDraftStateChange?: (draftState: PdpEditorDraftState) => void;
  onManualSave?: () => void;
  referenceModelImage?: PreparedImageDraft | null;
  referenceModelUsage?: ReferenceModelUsage | null;
  /** 첨부 자리마다 적은 「이 그림을 어떻게 쓸까요」. 안 붙은 자리는 걸러서 온다. */
  attachmentIntents?: AttachmentIntents;
  /** 페이지 전체의 배경 설명(채널·시즌). 1단계의 「그 밖에」다. */
  pageContext?: string;
  /**
   * 앞 단계로 되돌아간다. 편집기 안에서 못 가는 곳만 부모가 받는다.
   *
   * 전에는 편집기 막대에 이동이 아예 없어서, 눌러도 아무 일이 안 일어났다.
   */
  onJumpStep?: (id: "upload" | "analyze") => void;
  saveState?: "idle" | "saving" | "saved" | "error";
  onBeforeReplace?: () => Promise<boolean>;
  onSectionsChange: Dispatch<SetStateAction<SectionBlueprint[]>>;
  onUndo?: () => void;
}

/** /api/pdp/images/batch 응답. 실패한 섹션은 ok:false 로 개별 표시된다. */
type BatchImagesResponse =
  | {
      ok: true;
      requested: number;
      succeeded: number;
      results: Array<
        | { sectionId: string; ok: true; imageBase64: string; mimeType: string; qa?: { warnings?: QaDefect[]; status?: "passed" | "failed" | "review_required" | "unavailable" } }
        | { sectionId: string; ok: false; code?: string; message?: string }
      >;
      stopBatch?: boolean;
      message?: string;
    }
  | { ok: false; code?: string; message?: string; requested?: number; succeeded?: number; results?: never };

type GenerationRun = {
  mode: "single" | "batch";
  /** 남은 묶음의 예상 소요(초). 안내 문구에 쓴다. */
  expectedSeconds?: number;
  status: "running" | "finished";
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentLabel: string;
  startedAt: number;
  endedAt?: number;
};

type ImageGenerationOutcome = {
  ok: boolean;
  stopBatch?: boolean;
};


export function PdpEditor({
  initialResult,
  draftId = null,
  review,
  designSystem,
  styleReference,
  preserveProduct = true,
  personSource,
  characterId,
  characterAngles,
  aspectRatio,
  outputMode,
  look = "photoreal",
  userInstruction = "",
  startMode = "image",
  productKind,
  imageModel = DEFAULT_IMAGE_MODEL,
  desiredTone,
  initialDraftState,
  recoveredNotice,
  recoveredFailures,
  onDuplicateRequest,
  lastSavedAt,
  manualSaveToastToken = 0,
  onOpenSettings,
  onReset,
  onDraftStateChange,
  onManualSave,
  referenceModelImage = null,
  referenceModelUsage = null,
  attachmentIntents,
  pageContext,
  onJumpStep,
  saveState = "idle",
  onBeforeReplace,
  onSectionsChange,
  onUndo,
}: PdpEditorProps) {
  const creditPolicy = useCreditPolicy();
  // 문장 속 「성공 3장」은 이미지 개수라 그대로다. 바꾸는 것은 차감 금액의 단위뿐이다.
  const 단위 = useCreditUnit();
  const [currentSectionIndex, setCurrentSectionIndex] = useState(() => initialDraftState?.currentSectionIndex ?? 0);
  const sections = initialResult.blueprint.sections;
  const setSections = onSectionsChange;
  /* 격자에서 여러 장을 동시에 만들 수 있으므로 '생성 중'을 섹션 키 집합으로 둔다. */
  const [generatingKeys, setGeneratingKeys] = useState<string[]>([]);
  const [generationRun, setGenerationRun] = useState<GenerationRun | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState(
    () =>
      initialDraftState?.notice ??
      (outputMode === "full-image"
        ? "통이미지 모드. 문구가 이미지에 포함돼 있어요. 확인하고 바로 다운로드하세요."
        : "섹션 컷을 고르고 텍스트를 배치한 뒤 바로 다운로드할 수 있습니다.")
  );
  /* 레이어·설정은 섹션 순서가 아니라 고유 키로 저장한다.
     순서로 저장하면 섹션 순서를 바꿨을 때 다른 섹션의 레이어가 딸려온다. */
  const [sectionKeys, setSectionKeys] = useState<string[]>(() =>
    restoreSectionKeys({
      draftKeys: initialDraftState?.sectionKeys,
      draftSections: initialDraftState?.sections,
      // **지금 그리는 섹션**과 짝이 맞는지 본다. 초안끼리 비교하면 어긋난 채 통과한다.
      renderedSections: initialResult.blueprint.sections,
    }),
  );
  /**
   * **지금** 키 배열(A-16).
   *
   * 비동기 결과를 붙일 때 클로저의 `sectionKeys` 를 쓰면 **생성을 시작할 때의
   * 배열**이다. 도는 동안 순서가 바뀌면 인덱스와 키의 짝이 달라져 엉뚱한
   * 섹션에 이미지가 박힌다.
   *
   * 지금은 순서 변경·삭제가 잠겨 있어 그 창이 안 열린다. 다만 **잠금이 유일한
   * 방어**이면 잠금을 안 거는 길이 하나 생길 때 조용히 되살아난다.
   */
  const sectionKeysRef = useRef<string[]>(sectionKeys);
  // 렌더 중에 대입하지 않는다 — 버려지는 렌더에서도 대입된다.
  useEffect(() => {
    sectionKeysRef.current = sectionKeys;
  }, [sectionKeys]);

  const [sectionOptions, setSectionOptions] = useState<Record<string, ImageGenOptions>>(
    () =>
      normalizeSectionOptions(
        initialDraftState?.sectionOptions ?? {},
        referenceModelUsage,
        // '첫 섹션'은 순서가 아니라 키로 가린다.
        restoreSectionKeys({
          draftKeys: initialDraftState?.sectionKeys,
          draftSections: initialDraftState?.sections,
          renderedSections: initialResult.blueprint.sections,
        })[0]
      )
  );
  /** 끄는(크기를 바꾸는) 중인 레이어의 임시 값. 사연은 `layer-preview.ts`. */
  const [layerPreview, setLayerPreview] = useState<LayerPreview>(null);
  const [overlaysBySection, setOverlaysBySection] = useState<Record<string, CanvasLayer[]>>(
    () => normalizeOverlayRecord(initialDraftState?.overlaysBySection ?? {})
  );
  const [defaultCopyLanguage, setDefaultCopyLanguage] = useState<PdpCopyLanguage>(
    () => initialDraftState?.defaultCopyLanguage ?? "ko"
  );
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [activeColorPalette, setActiveColorPalette] = useState<null | { layerId: string; role: "text" | "shape" | "shadow" }>(null);
  const [colorRecommendations, setColorRecommendations] = useState<ImageColorRecommendations>(DEFAULT_COLOR_RECOMMENDATIONS);
  const [inspectorSections, setInspectorSections] = useState({
    shotMood: true,
    persona: true,
    emphasis: true,
  });
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>(() => initialDraftState?.workbenchTab ?? "image");
  const [workbenchState, setWorkbenchState] = useState<FloatingWorkbenchState>(
    () =>
      initialDraftState?.workbenchState ?? {
        x: 756,
        y: 24,
        width: 332,
        height: 500,
        isOpen: true,
      }
  );
  /* 갤러리(전체 검토) ↔ 편집(한 장 다듬기). 기본은 갤러리 —
     분석 직후에는 전체 흐름부터 보는 게 순서다. */
  const [screen, setScreen] = useState<"gallery" | "editor">("gallery");
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  // 라이브러리 저장은 브라우저 초안 저장과 다르다. 계정에 올려 기기를 옮겨도 남는다.
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const [isDownloadingStitched, setIsDownloadingStitched] = useState(false);
  /*
    **라이브러리에 어느 판을 어디까지 올렸나.**

    같은 판을 또 올리면 서버가 한 작업 뒤에 같은 장을 또 이어 붙인다.
    끊긴 판은 이어서 올린다. 화면에 「저장됨」을 보여 주려고 상태로도 둔다.
  */
  const [libraryProgress, setLibraryProgress] = useState<LibraryUploadProgress | null>(null);
  const libraryProgressRef = useRef<LibraryUploadProgress | null>(null);
  const librarySavingRef = useRef(false);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  /*
    **겉을 줄이는 배율.** 안쪽 캔버스는 늘 460px 이라 레이어 좌표의 뜻이
    화면 폭과 무관해진다. 좁은 화면에서는 이 값만 작아진다.
  */
  const canvasFitRef = useRef<HTMLDivElement | null>(null);
  const [canvasFit, setCanvasFit] = useState(1);
  /*
    줄인 만큼 **자리도 줄여야** 아래에 빈 공간이 생기지 않는다.
    `transform: scale()` 은 보이는 크기만 줄이고 레이아웃 높이는 그대로다.
  */
  const [canvasHeight, setCanvasHeight] = useState<number | null>(null);
  /**
   * 편집 캔버스의 마지막 실제 폭.
   *
   * 레이어의 `x`·`y`·`width` 는 그 캔버스 폭을 기준으로 한 절대 픽셀이다. 그런데
   * 캔버스는 편집 화면에서만 붙어 있고, 「전체 ZIP」 버튼은 공통 머리글에 있어
   * 갤러리에서도 눌린다. 그때 폭을 못 구해 460 고정값으로 떨어졌고, 가용 폭이
   * 그보다 좁은 화면(모바일·좁은 창)에서 배치한 글자가 안쪽으로 밀리거나
   * 이미지 밖으로 나갔다 — 같은 섹션이 어느 화면에서 받았느냐에 따라 달라졌다.
   *
   * 사용자가 레이어를 놓은 것은 캔버스가 붙어 있던 그때이므로, 마지막으로 잰
   * 값이 곧 그 기준이다.
   */
  const lastCanvasWidthRef = useRef<number | null>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const resizeSessionRef = useRef<Record<string, { width: number; height: number; fontSize: number }>>({});
  const generationLockRef = useRef(false);
  const retryRequestKeysRef = useRef<Record<string, string>>({});

  const currentSection = sections[currentSectionIndex];
  const currentSectionKey = sectionKeys[currentSectionIndex] ?? String(currentSectionIndex);
  const isGeneratingSection = generatingKeys.includes(currentSectionKey);
  const isGenerating = generatingKeys.length > 0;
  const layerCounts = Object.fromEntries(
    Object.entries(overlaysBySection).map(([key, layers]) => [key, layers.length])
  );
  const currentLayers = overlaysBySection[currentSectionKey] ?? [];
  const currentTextLayers = currentLayers.filter(isTextLayer);
  const currentShapeLayers = currentLayers.filter(isShapeLayer);
  /*
    **옆 숫자도 같이 움직여야 한다**(B-12-c 리뷰).

    크기 손잡이를 끄는 동안 캔버스의 글자는 임시 글자 크기로 실시간으로
    커지는데, 작업대의 「폭」·「크기」 칸은 확정값을 읽어 **손을 뗄 때까지
    멈춰 있다가 한 번에 튀었다.** 같은 화면에 두 값이 어긋나 보인다.
  */
  const committedLayer = currentLayers.find((overlay) => overlay.id === selectedOverlayId) ?? null;
  const selectedLayer = committedLayer ? previewedLayer(committedLayer, layerPreview) : null;
  const selectedTextLayer = selectedLayer && isTextLayer(selectedLayer) ? selectedLayer : null;
  const selectedShapeLayer = selectedLayer && isShapeLayer(selectedLayer) ? selectedLayer : null;
  const generatedCount = sections.filter((section) => Boolean(section.generatedImage)).length;
  const blueprintList = initialResult.blueprint.blueprintList.filter(Boolean);
  const toneLabel = desiredTone || "AI 자동 추천";
  const progressPercent = sections.length ? Math.round(((currentSectionIndex + 1) / sections.length) * 100) : 0;

  useEffect(() => {
    setSelectedOverlayId(null);
    setEditingOverlayId(null);
    setActiveColorPalette(null);
    setErrorMessage("");
  }, [currentSectionIndex]);

  useEffect(() => {
    if (!selectedLayer) {
      return;
    }

    setWorkbenchState((current) => ({
      ...current,
      isOpen: true,
    }));
  }, [currentSectionIndex, selectedLayer]);

  useEffect(() => {
    onDraftStateChange?.({
      currentSectionIndex,
      sections,
      sectionKeys,
      sectionOptions,
      overlaysBySection,
      defaultCopyLanguage,
      notice,
      workbenchTab,
      workbenchState,
    });
  }, [currentSectionIndex, defaultCopyLanguage, notice, onDraftStateChange, overlaysBySection, sectionKeys, sectionOptions, sections, workbenchState, workbenchTab]);

  useEffect(() => {
    let isCancelled = false;

    if (!currentSection?.generatedImage) {
      setColorRecommendations(DEFAULT_COLOR_RECOMMENDATIONS);
      return;
    }

    void extractImageColorRecommendations(currentSection.generatedImage).then((next) => {
      if (!isCancelled) {
        setColorRecommendations(next);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [currentSection?.generatedImage]);

  useEffect(() => {
    if (!manualSaveToastToken) {
      return;
    }

    setShowSaveToast(true);
    const timeout = window.setTimeout(() => {
      setShowSaveToast(false);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [manualSaveToastToken]);

  const textColorRecommendations = useMemo(
    () => sortColorsByContrast(colorRecommendations.recommendedTextColors, selectedTextLayer?.color ?? null),
    [colorRecommendations.recommendedTextColors, selectedTextLayer?.color]
  );
  const shapeColorRecommendations = useMemo(
    () => sortColorsByContrast(colorRecommendations.recommendedShapeColors, selectedShapeLayer?.fillColor ?? null),
    [colorRecommendations.recommendedShapeColors, selectedShapeLayer?.fillColor]
  );
  const photoColorRecommendations = useMemo(() => uniqueColors(colorRecommendations.photoColors), [colorRecommendations.photoColors]);

  const currentOptions = useMemo(() => {
    return normalizeImageOptions(
      sectionOptions[currentSectionKey],
      referenceModelUsage === "all-sections" ? true : currentSectionIndex === 0
    );
  }, [currentSectionIndex, currentSectionKey, referenceModelUsage, sectionOptions]);

  const referenceModelAppliesToCurrentSection = Boolean(
    referenceModelImage &&
      referenceModelUsage &&
      (referenceModelUsage === "all-sections" || currentSectionIndex === 0)
  );
  const usesReferenceModel = Boolean(currentOptions.withModel && referenceModelAppliesToCurrentSection);
  const personaLockedMessage = usesReferenceModel
    ? referenceModelUsage === "all-sections"
      ? "모델 일관성 유지 선택으로 타깃 페르소나가 비활성화되었습니다."
      : "히어로우 전용 업로드 모델이 적용되어 타깃 페르소나가 비활성화되었습니다."
    : "";

  /*
    **훅은 early return 앞에 둔다.**

    아래 넷은 원래 이 파일 한참 뒤(캡처 함수들 사이)에 있었다. 그런데 바로
    밑에 `if (!currentSection) return …` 이 있어서, 섹션이 있다가 없어지는
    순간 **훅 개수가 달라진다** — React 가 「Rendered more hooks than during
    the previous render」로 죽는다.

    `next build` 가 이것을 lint 오류(`react-hooks/rules-of-hooks`) 넷으로
    막고 있었다. 운영 빌드가 통째로 안 됐다.

    쓰는 자리(ref 콜백)는 그대로다. 선언 자리만 위로 옮긴다.
  */
  /*
    **붙는 순간에 관찰을 시작한다.**

    `useEffect` 로 하면 갤러리↔편집을 오갈 때 딸림값이 안 바뀌어 **다시 돌지
    않는다.** 그때 캔버스는 아직 없었으므로 관찰자가 한 번도 안 붙고, 창을
    줄여도 배율이 1 그대로다 — 2026-09-17 실제 브라우저로 그렇게 확인했다.
    ref 콜백은 실제로 붙고 떨어질 때마다 불린다.
  */
  const fitObserverRef = useRef<ResizeObserver | null>(null);
  const attachCanvasFit = useCallback((node: HTMLDivElement | null) => {
    fitObserverRef.current?.disconnect();
    fitObserverRef.current = null;
    canvasFitRef.current = node;
    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setCanvasFit(canvasFitFor(entry?.contentRect.width));
    });
    observer.observe(node);
    fitObserverRef.current = observer;
    setCanvasFit(canvasFitFor(node.clientWidth));
  }, []);

  /** 안쪽 높이는 그림 비율이 정한다. 줄인 만큼 자리도 줄이려면 이 값이 필요하다. */
  const heightObserverRef = useRef<ResizeObserver | null>(null);
  const attachCanvas = useCallback((node: HTMLDivElement | null) => {
    heightObserverRef.current?.disconnect();
    heightObserverRef.current = null;
    imageContainerRef.current = node;
    if (!node) return;
    // 안쪽 폭은 늘 460 이다. 내보내기가 이 값을 기준으로 굽는다.
    if (node.clientWidth) lastCanvasWidthRef.current = node.clientWidth;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setCanvasHeight(entry?.contentRect.height ?? null);
    });
    observer.observe(node);
    heightObserverRef.current = observer;
    setCanvasHeight(node.clientHeight || null);
  }, []);

  /** 지금 페이지의 판. 그림·순서·얹은 글자 중 하나라도 바뀌면 달라진다. */
  const libraryEntries = useMemo(
    () =>
      sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => Boolean(section.generatedImage)),
    [sections],
  );
  const libraryVersionSections = useMemo(
    () =>
      libraryEntries.map(({ section, index }) => {
        const key = sectionKeys[index] ?? String(index);
        return { key, image: section.generatedImage as string, layers: overlaysBySection[key] ?? [] };
      }),
    [libraryEntries, overlaysBySection, sectionKeys],
  );
  const currentLibraryKey = useMemo(() => libraryVersionKey(libraryVersionSections), [libraryVersionSections]);
  const librarySaved =
    libraryEntries.length > 0 &&
    pendingLibraryUpload(libraryProgress, currentLibraryKey, libraryEntries.length).done;

  /*
    **생성이 끝나면 라이브러리에 자동으로 올린다.**

    일괄 생성이 끝났을 때, 그리고 아직 한 번도 안 올린 페이지가 한 장씩 만들어져
    다 채워졌을 때다. 한 장을 다시 만들 때마다 올리면 목록이 같은 페이지로
    가득 찬다 — 그때는 단추가 「변경분 저장」으로 알려 준다.

    **다 만들어졌을 때만 올린다.** 반쯤 만든 페이지를 올리면 나머지를 채운 뒤
    또 한 벌이 생긴다.
  */
  // 저장 함수는 아래(이른 반환 뒤)에서 짓는다. 훅은 그 앞에 있어야 하므로
  // 가리키는 자리만 먼저 둔다. 매 렌더 마지막 함수로 바꿔 끼운다.
  const saveToLibraryRef = useRef<(options?: { auto?: boolean }) => Promise<void>>(async () => {});
  const autoSavedRunRef = useRef<number | null>(null);
  useEffect(() => {
    if (generationRun?.status !== "finished" || !generationRun.completed) return;
    if (autoSavedRunRef.current === generationRun.startedAt) return;
    if (!sections.length || sections.some((section) => !section.generatedImage)) return;
    if (generationRun.mode !== "batch" && libraryProgressRef.current) return;
    autoSavedRunRef.current = generationRun.startedAt;
    void saveToLibraryRef.current({ auto: true });
  }, [generationRun, sections]);

  if (!currentSection) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm">
        <AlertCircle size={16} className="mt-0.5 flex-none text-destructive" />
        섹션 정보를 불러오지 못했습니다.
      </div>
    );
  }

  /**
   * 이 섹션에서 강조할 낱말.
   *
   * 제목을 고친 뒤 예전 낱말이 남아 있으면 모델에게 "없는 단어를 강조하라"고
   * 시키게 된다. 읽는 시점에 걸러 낸다 — 저장된 값을 지우지는 않는다.
   */
  const currentEmphasisWords = keepWordsPresentIn(
    currentSection.headline ?? "",
    currentOptions.emphasisWords ?? [],
  );

  const setCurrentOptions = (updates: Partial<ImageGenOptions>) => {
    setSectionOptions((current) => ({
      ...current,
      [currentSectionKey]: {
        ...currentOptions,
        ...updates,
      },
    }));
  };

  const updateTextOverlayContent = (overlayId: string, nextText: string) => {
    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionKey]: (current[currentSectionKey] ?? []).map((overlay) => {
        if (overlay.id !== overlayId || !isTextLayer(overlay)) {
          return overlay;
        }

        return normalizeTextOverlay({
          ...overlay,
          text: nextText,
          translations: {
            ...overlay.translations,
            [overlay.language]: nextText,
          },
        });
      }),
    }));
  };

  const handleOverlayLanguageChange = (overlay: TextOverlay, nextLanguage: PdpCopyLanguage) => {
    if (overlay.language === nextLanguage) {
      return;
    }

    setDefaultCopyLanguage(nextLanguage);
    updateOverlay(overlay.id, applyLanguageToTextOverlay(overlay, nextLanguage));
  };

  const handleTextAlignChange = (overlay: TextOverlay, nextAlign: OverlayTextAlign) => {
    const currentWidth = toNumericSize(overlay.width, 320);
    // 캔버스를 벗어나지 않는 만큼만 넓힌다. 전에는 안 봐서 오른쪽이 잘렸다.
    const nextWidth = alignedWidthFor({ x: overlay.x, width: currentWidth, fontSize: overlay.fontSize });

    updateOverlay(overlay.id, {
      textAlign: nextAlign,
      width: nextWidth,
    });

    if (nextWidth > currentWidth) {
      setNotice("줄맞춤이 잘 보이도록 텍스트 박스 폭도 함께 넓혔습니다.");
    }
  };

  const stopShellClick = (event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const clearLayerSelection = () => {
    setSelectedOverlayId(null);
    setEditingOverlayId(null);
    setActiveColorPalette(null);
  };

  const toggleInspectorSection = (key: keyof typeof inspectorSections) => {
    setInspectorSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  // 작업대는 이미지 옆 칸에 고정돼 있다. 여는 것만 하면 된다.
  const openWorkbench = (tab: WorkbenchTab) => {
    setWorkbenchTab(tab);
    setWorkbenchState((current) => ({ ...current, isOpen: true }));
  };

  const renderColorPaletteField = ({
    label,
    layerId,
    role,
    currentColor,
    recommendedColors,
    onSelect,
  }: {
    label: string;
    layerId: string;
    role: "text" | "shape" | "shadow";
    currentColor: string;
    recommendedColors: string[];
    onSelect: (color: string) => void;
  }) => {
    const isOpen = activeColorPalette?.layerId === layerId && activeColorPalette.role === role;

    return (
      <label className={styles.floatingField}>
        <span className={styles.optionMiniLabel}>{label}</span>
        <div className={styles.colorFieldStack}>
          <button
            className={styles.colorTriggerButton}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setActiveColorPalette((current) =>
                current?.layerId === layerId && current.role === role ? null : { layerId, role }
              );
            }}
            style={{ ["--swatch-color" as string]: currentColor }}
            type="button"
          >
            <span className={styles.colorTriggerPreview} />
            <code>{currentColor}</code>
          </button>

          {isOpen ? (
            <div className={styles.colorPopover}>
              <div className={styles.paletteSection}>
                <span className={styles.optionMiniLabel}>사진 색상</span>
                <div className={styles.swatchGridWide}>
                  {photoColorRecommendations.map((color) => (
                    <button
                      className={styles.swatchButton}
                      key={`${role}-photo-${color}`}
                      onClick={() => {
                        onSelect(color);
                        setActiveColorPalette(null);
                      }}
                      style={{ ["--swatch-color" as string]: color }}
                      type="button"
                    >
                      <span className={styles.swatchPreview} />
                      <code>{color}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.paletteSection}>
                <span className={styles.optionMiniLabel}>기본 단색</span>
                <div className={styles.swatchGridWide}>
                  {BASIC_SOLID_COLORS.map((color) => (
                    <button
                      className={styles.swatchButton}
                      key={`${role}-basic-${color}`}
                      onClick={() => {
                        onSelect(color);
                        setActiveColorPalette(null);
                      }}
                      style={{ ["--swatch-color" as string]: color }}
                      type="button"
                    >
                      <span className={styles.swatchPreview} />
                      <code>{color}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.paletteSection}>
                <span className={styles.optionMiniLabel}>어울리는 컬러 추천</span>
                <div className={styles.swatchGridWide}>
                  {recommendedColors.map((color) => (
                    <button
                      className={styles.swatchButton}
                      key={`${role}-recommended-${color}`}
                      onClick={() => {
                        onSelect(color);
                        setActiveColorPalette(null);
                      }}
                      style={{ ["--swatch-color" as string]: color }}
                      type="button"
                    >
                      <span className={styles.swatchPreview} />
                      <code>{color}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.colorInputRow}>
                <input
                  className={styles.colorInputLarge}
                  onChange={(event) => onSelect(event.target.value)}
                  type="color"
                  value={currentColor}
                />
                <button className={styles.inlineButton} onClick={() => setActiveColorPalette(null)} type="button">
                  닫기
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </label>
    );
  };

  const selectedModelSummary = currentOptions.withModel
    ? usesReferenceModel
      ? referenceModelUsage === "all-sections"
        ? "업로드 모델 일관성 유지"
        : "히어로우 업로드 모델 사용"
      : `${getModelCountryLabel(currentOptions.modelCountry)} ${getModelAgeLabel(currentOptions.modelAgeRange)} ${getModelGenderLabel(currentOptions.modelGender)}`
    : "모델 없이 제품 중심";

  const renderWorkbenchBody = () => {
    switch (workbenchTab) {
      case "image":
        return (
          <div className={styles.workbenchSectionStack}>
            <div className={styles.optionSummaryBar}>
              <span className={styles.summaryChip}>
                {STYLE_OPTIONS.find((option) => option.value === currentOptions.style)?.label ?? "스튜디오컷"}
              </span>
              <span className={styles.summaryChip}>{selectedModelSummary}</span>
              <span className={styles.summaryChip}>
                {currentOptions.guidePriorityMode === "guide-first" ? "디자인 가이드 우선" : "컷 타입 우선"}
              </span>
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>샷 타입</span>
                  <strong>배경과 연출 무드</strong>
                </div>
                <button className={styles.sectionToggleButton} onClick={() => toggleInspectorSection("shotMood")} type="button">
                  {inspectorSections.shotMood ? "숨기기" : "보이기"}
                  {inspectorSections.shotMood ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              {inspectorSections.shotMood ? (
                <>
                  <div className={styles.styleOptionGrid}>
                    {STYLE_OPTIONS.map((style) => (
                      <button
                        className={currentOptions.style === style.value ? styles.styleCardActive : styles.styleCard}
                        key={style.value}
                        onClick={() => setCurrentOptions({ style: style.value })}
                        type="button"
                      >
                        <strong>{style.label}</strong>
                        <small>{style.description}</small>
                      </button>
                    ))}
                  </div>

                  <label className={styles.toggleCard}>
                    <div className={styles.toggleCardCopy}>
                      <strong>디자인 가이드 우선</strong>
                      <span>
                        {currentOptions.guidePriorityMode === "guide-first"
                          ? "Image Purpose, Layout Notes, Style Guide를 함께 반영합니다."
                          : "Image Purpose만 유지하고, 선택한 컷 타입을 우선해 이미지를 설계합니다."}
                      </span>
                    </div>
                    <input
                      checked={currentOptions.guidePriorityMode === "guide-first"}
                      onChange={(event) =>
                        setCurrentOptions({
                          guidePriorityMode: event.target.checked ? "guide-first" : "style-first",
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                </>
              ) : (
                <p className={styles.collapsedHint}>
                  현재 선택: {STYLE_OPTIONS.find((style) => style.value === currentOptions.style)?.label ?? "스튜디오컷"} ·{" "}
                  {currentOptions.guidePriorityMode === "guide-first" ? "디자인 가이드 우선" : "컷 타입 우선"}
                </p>
              )}
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>모델 설정</span>
                  <strong>타깃 페르소나 지정</strong>
                </div>
                <div className={styles.optionHeaderTools}>
                  <User size={16} />
                  <button className={styles.sectionToggleButton} onClick={() => toggleInspectorSection("persona")} type="button">
                    {inspectorSections.persona ? "숨기기" : "보이기"}
                    {inspectorSections.persona ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>
              {inspectorSections.persona ? (
                <>
                  <label className={styles.toggleCard}>
                    <div className={styles.toggleCardCopy}>
                      <strong>모델컷 포함</strong>
                      <span>
                        {referenceModelImage
                          ? "제품과 함께 연출되는 인물컷이 필요하면 켜 두세요. 업로드 모델이 적용되는 구간에서는 동일 인물이 유지됩니다."
                          : "제품과 함께 연출되는 인물컷이 필요한 경우 켜 두세요."}
                      </span>
                    </div>
                    <input
                      checked={currentOptions.withModel}
                      onChange={(event) => setCurrentOptions({ withModel: event.target.checked })}
                      type="checkbox"
                    />
                  </label>

                  {currentOptions.withModel ? (
                    <div className={styles.optionStack}>
                      {usesReferenceModel ? (
                        <div className={styles.lockedHint}>
                          <AlertCircle size={15} />
                          <div>
                            <strong>{referenceModelUsage === "all-sections" ? "전체 일관성 유지 적용 중" : "히어로우 업로드 모델 적용 중"}</strong>
                            <span>{personaLockedMessage}</span>
                          </div>
                        </div>
                      ) : null}

                      <div className={styles.optionFieldBlock}>
                        <span className={styles.optionMiniLabel}>성별</span>
                        <div className={styles.segmentedRow}>
                          {MODEL_GENDER_OPTIONS.map((option) => (
                            <button
                              className={currentOptions.modelGender === option.value ? styles.segmentedButtonActive : styles.segmentedButton}
                              disabled={usesReferenceModel}
                              key={option.value}
                              onClick={() => setCurrentOptions({ modelGender: option.value })}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.optionFieldBlock}>
                        <span className={styles.optionMiniLabel}>연령대</span>
                        <div className={styles.segmentedGridCompact}>
                          {MODEL_AGE_OPTIONS.map((option) => (
                            <button
                              className={currentOptions.modelAgeRange === option.value ? styles.segmentedButtonActive : styles.segmentedButton}
                              disabled={usesReferenceModel}
                              key={option.value}
                              onClick={() => setCurrentOptions({ modelAgeRange: option.value })}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.optionFieldBlock}>
                        <div className={styles.optionFieldHeader}>
                          <span className={styles.optionMiniLabel}>국가</span>
                          <Globe2 size={14} />
                        </div>
                        <div className={styles.countryGrid}>
                          {MODEL_COUNTRY_OPTIONS.map((option) => (
                            <button
                              className={currentOptions.modelCountry === option.value ? styles.countryCardActive : styles.countryCard}
                              disabled={usesReferenceModel}
                              key={option.value}
                              onClick={() => setCurrentOptions({ modelCountry: option.value })}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className={styles.collapsedHint}>현재 설정: {selectedModelSummary}</p>
              )}
            </div>

            {/*
              글자를 이미지에 그려 주는 모드에서만 보여준다. 텍스트편집 모드는 글자 없는
              사진을 만들고 카피를 편집기에서 얹으므로, 여기서 정할 것이 없다.
            */}
            {outputMode === "full-image" ? (
              <div className={styles.optionSurface}>
                <div className={styles.optionSectionHeader}>
                  <div>
                    <span className={styles.optionSectionEyebrow}>글자 디자인</span>
                    <strong>제목에서 강조할 낱말</strong>
                  </div>
                  <div className={styles.optionHeaderTools}>
                    <Sparkles size={16} />
                    <button
                      className={styles.sectionToggleButton}
                      onClick={() => toggleInspectorSection("emphasis")}
                      type="button"
                    >
                      {inspectorSections.emphasis ? "숨기기" : "보이기"}
                      {inspectorSections.emphasis ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>
                {inspectorSections.emphasis ? (
                  <div className="grid gap-2 pt-1">
                    <p className="text-xs text-muted-foreground">
                      누른 낱말이 강조색으로 굵게 그려집니다. 안 고르면 AI 가 알아서 한두 낱말을 고릅니다.
                    </p>
                    <EmphasisWordPicker
                      headline={currentSection.headline ?? ""}
                      selected={currentEmphasisWords}
                      onChange={(words) => setCurrentOptions({ emphasisWords: words })}
                    />
                  </div>
                ) : (
                  <p className={styles.collapsedHint}>
                    {currentEmphasisWords.length > 0
                      ? `강조: ${currentEmphasisWords.join(", ")}`
                      : "AI 가 알아서 고릅니다"}
                  </p>
                )}
              </div>
            ) : null}

            <button className={styles.primaryButtonWide} disabled={isGenerating} onClick={() => void handleGenerateImage()} type="button">
              {isGeneratingSection ? <Loader2 className={styles.spinIcon} size={16} /> : null}
              {currentSection.generatedImage ? "이미지 다시 만들기" : "이미지 생성하기"}
            </button>

            <p className={styles.inspectorHelper}>
              {usesReferenceModel
                ? "업로드한 모델 이미지를 참조하면서 현재 섹션 컷만 다시 생성합니다."
                : "섹션 헤드라인과 지금 선택한 모델 조건을 반영해 현재 컷만 다시 생성합니다."}
              <br />성공 시 이미지 크레딧 1장이 차감됩니다.
            </p>
          </div>
        );
      case "layer":
        return selectedTextLayer ? (
          <div className={styles.workbenchSectionStack}>
            <div className={styles.toolbarRow}>
              <button className={styles.inlineDangerButton} onClick={() => deleteOverlay(selectedTextLayer.id)} type="button">
                삭제
              </button>
            </div>

            <label className={styles.floatingField}>
              <div className={styles.fieldHeaderInline}>
                <span className={styles.optionMiniLabel}>텍스트 내용</span>
                <div className={styles.languageControlRow}>
                  <select
                    className={styles.miniSelect}
                    onChange={(event) => handleOverlayLanguageChange(selectedTextLayer, event.target.value as PdpCopyLanguage)}
                    value={selectedTextLayer.language}
                  >
                    <option value="ko">한국어</option>
                    <option value="en">영어</option>
                  </select>
                </div>
              </div>
              <textarea
                className={styles.floatingTextarea}
                onChange={(event) => updateTextOverlayContent(selectedTextLayer.id, event.target.value)}
                rows={3}
                value={selectedTextLayer.text}
              />
            </label>

            <div className={styles.floatingCompactGrid}>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>폰트</span>
                <select
                  className={styles.select}
                  onChange={(event) => updateOverlay(selectedTextLayer.id, { fontFamily: event.target.value })}
                  value={selectedTextLayer.fontFamily}
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>굵기</span>
                <select
                  className={styles.select}
                  onChange={(event) => updateOverlay(selectedTextLayer.id, { fontWeight: event.target.value })}
                  value={selectedTextLayer.fontWeight}
                >
                  {FONT_WEIGHT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.floatingCompactGrid}>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>폭</span>
                <input
                  className={styles.input}
                  min={80}
                  onChange={(event) =>
                    updateOverlay(selectedTextLayer.id, {
                      width: clampValue(Number(event.target.value) || 320, 80, 1200),
                    })
                  }
                  type="number"
                  value={toNumericSize(selectedTextLayer.width, 320)}
                />
              </label>

              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>크기</span>
                <div className={styles.rangeField}>
                  <input
                    className={styles.rangeInput}
                    max={180}
                    min={10}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { fontSize: Number(event.target.value) || 16 })}
                    type="range"
                    value={selectedTextLayer.fontSize}
                  />
                  <input
                    className={styles.input}
                    min={10}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { fontSize: Number(event.target.value) || 16 })}
                    type="number"
                    value={selectedTextLayer.fontSize}
                  />
                </div>
              </label>

              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>줄 간격</span>
                <div className={styles.rangeField}>
                  <input
                    className={styles.rangeInput}
                    max={3}
                    min={0.8}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { lineHeight: Number(event.target.value) || 1.2 })}
                    step={0.1}
                    type="range"
                    value={selectedTextLayer.lineHeight}
                  />
                  <input
                    className={styles.input}
                    max={3}
                    min={0.8}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { lineHeight: Number(event.target.value) || 1.2 })}
                    step={0.1}
                    type="number"
                    value={selectedTextLayer.lineHeight}
                  />
                </div>
              </label>
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>Color palette</span>
                  <strong>글자색</strong>
                </div>
                <Palette size={16} />
              </div>
              {renderColorPaletteField({
                label: "글자색",
                layerId: selectedTextLayer.id,
                role: "text",
                currentColor: selectedTextLayer.color,
                recommendedColors: textColorRecommendations,
                onSelect: (color) => updateOverlay(selectedTextLayer.id, { color }),
              })}
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>Shadow</span>
                  <strong>가독성 그림자</strong>
                </div>
                <Sparkles size={16} />
              </div>
              <label className={styles.toggleCard}>
                <div className={styles.toggleCardCopy}>
                  <strong>그림자 사용</strong>
                  <span>밝은 이미지 위에서도 텍스트가 묻히지 않도록 깊이를 더합니다.</span>
                </div>
                <input
                  checked={selectedTextLayer.shadowEnabled}
                  onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowEnabled: event.target.checked })}
                  type="checkbox"
                />
              </label>

              {selectedTextLayer.shadowEnabled ? (
                <>
                  {renderColorPaletteField({
                    label: "그림자색",
                    layerId: selectedTextLayer.id,
                    role: "shadow",
                    currentColor: selectedTextLayer.shadowColor,
                    recommendedColors: [colorRecommendations.darkColor, "#000000", colorRecommendations.accentColor],
                    onSelect: (color) => updateOverlay(selectedTextLayer.id, { shadowColor: color }),
                  })}
                  <div className={styles.floatingCompactGrid}>
                    <label className={styles.floatingField}>
                      <span className={styles.optionMiniLabel}>강도</span>
                      <div className={styles.rangeField}>
                        <input className={styles.rangeInput} max={1} min={0} step={0.05} type="range" value={selectedTextLayer.shadowOpacity} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOpacity: Number(event.target.value) || 0 })} />
                        <input className={styles.input} max={1} min={0} step={0.05} type="number" value={selectedTextLayer.shadowOpacity} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOpacity: Number(event.target.value) || 0 })} />
                      </div>
                    </label>
                    <label className={styles.floatingField}>
                      <span className={styles.optionMiniLabel}>흐림</span>
                      <div className={styles.rangeField}>
                        <input className={styles.rangeInput} max={40} min={0} step={1} type="range" value={selectedTextLayer.shadowBlur} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowBlur: Number(event.target.value) || 0 })} />
                        <input className={styles.input} max={40} min={0} step={1} type="number" value={selectedTextLayer.shadowBlur} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowBlur: Number(event.target.value) || 0 })} />
                      </div>
                    </label>
                    <label className={styles.floatingField}>
                      <span className={styles.optionMiniLabel}>거리</span>
                      <div className={styles.rangeField}>
                        <input className={styles.rangeInput} max={24} min={-24} step={1} type="range" value={selectedTextLayer.shadowOffsetY} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOffsetY: Number(event.target.value) || 0 })} />
                        <input className={styles.input} max={24} min={-24} step={1} type="number" value={selectedTextLayer.shadowOffsetY} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOffsetY: Number(event.target.value) || 0 })} />
                      </div>
                    </label>
                  </div>
                </>
              ) : null}
            </div>

            <div className={styles.floatingField}>
              <span className={styles.optionMiniLabel}>정렬</span>
              <div className={styles.alignButtonGroup}>
                {ALIGN_OPTIONS.map(({ value, label }) => (
                  <button
                    className={selectedTextLayer.textAlign === value ? styles.alignButtonActive : styles.alignButton}
                    key={value}
                    onClick={() => handleTextAlignChange(selectedTextLayer, value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : selectedShapeLayer ? (
          <div className={styles.workbenchSectionStack}>
            <div className={styles.toolbarRow}>
              <p className={styles.floatingHint}>사각형은 이미지 위, 텍스트 아래에 깔리는 독립 배경 오브젝트입니다.</p>
              <button className={styles.inlineDangerButton} onClick={() => deleteOverlay(selectedShapeLayer.id)} type="button">
                삭제
              </button>
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>Shape fill</span>
                  <strong>배경 사각형 색상</strong>
                </div>
                <Palette size={16} />
              </div>
              {renderColorPaletteField({
                label: "채우기 색상",
                layerId: selectedShapeLayer.id,
                role: "shape",
                currentColor: selectedShapeLayer.fillColor,
                recommendedColors: shapeColorRecommendations,
                onSelect: (color) => updateOverlay(selectedShapeLayer.id, { fillColor: color }),
              })}
            </div>

            <div className={styles.floatingCompactGrid}>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>투명도</span>
                <div className={styles.rangeField}>
                  <input className={styles.rangeInput} max={1} min={0} step={0.05} type="range" value={selectedShapeLayer.fillOpacity} onChange={(event) => updateOverlay(selectedShapeLayer.id, { fillOpacity: Number(event.target.value) || 0 })} />
                  <input className={styles.input} max={1} min={0} step={0.05} type="number" value={selectedShapeLayer.fillOpacity} onChange={(event) => updateOverlay(selectedShapeLayer.id, { fillOpacity: Number(event.target.value) || 0 })} />
                </div>
              </label>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>모서리</span>
                <div className={styles.rangeField}>
                  <input className={styles.rangeInput} max={48} min={0} step={1} type="range" value={selectedShapeLayer.borderRadius} onChange={(event) => updateOverlay(selectedShapeLayer.id, { borderRadius: Number(event.target.value) || 0 })} />
                  <input className={styles.input} max={48} min={0} step={1} type="number" value={selectedShapeLayer.borderRadius} onChange={(event) => updateOverlay(selectedShapeLayer.id, { borderRadius: Number(event.target.value) || 0 })} />
                </div>
              </label>
            </div>
          </div>
        ) : (
          <div className={styles.inspectorEmpty}>
            <Type size={18} />
            <div>
              <strong>텍스트나 사각형을 선택해 주세요</strong>
              <p>캔버스의 텍스트나 배경 사각형을 클릭하면 이 패널에서 바로 편집할 수 있습니다.</p>
              <div className={styles.inspectorEmptyActions}>
                <button className={styles.copyUtilityButton} onClick={handleAddShapeLayer} type="button">
                  배경 사각형 추가
                </button>
              </div>
            </div>
          </div>
        );
      case "copy":
        return (
          <div className={styles.copyLibrary}>
            {outputMode === "full-image" ? (
              <div
                style={{
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: "#5C554D",
                  background: "rgba(176,68,106,0.08)",
                  border: "1px solid rgba(176,68,106,0.2)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 4,
                }}
              >
                <b>통이미지 모드</b>. 문구가 이미 이미지에 들어있어요. 아래 텍스트·도형 도구는{" "}
                <b>추가로 얹고 싶을 때만</b> 쓰세요.
              </div>
            ) : null}
            <div className={styles.copySection}>
              <p className={styles.cardLabel}>Layout Object</p>
              <button className={styles.copyUtilityButton} onClick={handleAddShapeLayer} type="button">
                배경 사각형 추가
              </button>
            </div>

            {/*
              카피 자리를 손으로 쓰지 않고 목록을 돌며 그린다(copy-slots.ts).
              손으로 쓰다가 두 번 `onClick` 을 빼먹어 "화면에는 있는데 눌러도 안 되는
              카피"가 생겼다. 목록의 항목은 overlayType 을 반드시 가지므로 그럴 수 없다.
            */}
            {COPY_SLOTS.map((slot) => {
              const copy = slot.read(currentSection);
              if (!copy.ko.trim()) return null;
              return (
                <div className={styles.copySection} key={slot.overlayType}>
                  <p className={styles.cardLabel}>{slot.label}</p>
                  <button
                    className={slot.tone === "strong" ? styles.copyBlock : styles.copyBlockSoft}
                    onClick={() => handleAddTextOverlay(copy, slot.overlayType)}
                    type="button"
                  >
                    {getLocalizedCopy(copy.ko, copy.en, defaultCopyLanguage)}
                  </button>
                </div>
              );
            })}

            {currentSection.bullets.length ? (
              <div className={styles.copySection}>
                <p className={styles.cardLabel}>Key Points</p>
                <div className={styles.bulletStack}>
                  {getLocalizedBullets(currentSection, defaultCopyLanguage).map((bullet, index) => (
                    <button
                      className={styles.bulletButton}
                      key={`${bullet}-${index}`}
                      onClick={() =>
                        handleAddTextOverlay(
                          {
                            ko: currentSection.bullets[index] ?? bullet,
                            en: currentSection.bullets_en[index] ?? currentSection.bullets[index] ?? bullet,
                          },
                          "keypoint"
                        )
                      }
                      type="button"
                    >
                      <CheckCircle2 size={14} />
                      {bullet}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

          </div>
        );
      case "guide":
      default:
        return (
          <div className={styles.workbenchSectionStack}>
            <div className={styles.guidelineGrid}>
              <div>
                <strong>Guide Mode</strong>
                <p>{currentOptions.guidePriorityMode === "guide-first" ? "디자인 가이드 우선" : "컷 타입 우선"}</p>
              </div>
              <div>
                <strong>Image Purpose</strong>
                <p>{currentSection.purpose}</p>
              </div>
              <div>
                <strong>Layout Notes</strong>
                <p>{currentOptions.guidePriorityMode === "guide-first" ? currentSection.layout_notes : "이번 생성에는 적용하지 않음"}</p>
              </div>
              <div>
                <strong>Style Guide</strong>
                <p>{currentOptions.guidePriorityMode === "guide-first" ? currentSection.style_guide : "이번 생성에는 적용하지 않음"}</p>
              </div>
            </div>

            {currentSection.compliance_notes ? (
              <div className={styles.warningBox}>
                <strong>Compliance Notes</strong>
                <p>{currentSection.compliance_notes}</p>
              </div>
            ) : null}
          </div>
        );
    }
  };

  /**
   * 페이지 전체가 공유하는 값. **한 장이든 여러 장이든 같은 것을 보낸다.**
   *
   * 전에는 두 호출이 각자 몸통을 지었고, 그래서 「배치와 같은 값을 보내야 한다」는
   * 주석이 네 군데 붙어 있었다. 주석으로 지키던 것을 여기 한 곳으로 옮겼다.
   */
  /**
   * **만들기가 싣는 칸이 넘쳤는가.**
   *
   * 「이미지 연출 요청」은 이 화면이 아니라 **기획 화면**에 있는 칸인데,
   * 요청에 싣는 것은 여기다(`buildPageWire`). 상한이 늦게 붙어서, 그 전에
   * 저장된 초안이 넘친 값을 담은 채 복원되면 서버가 「요청이 올바르지
   * 않습니다」 한 줄로 거절한다 — **어느 칸인지도 모르고 이 화면에는 그
   * 칸을 고칠 입력란도 없다.**
   *
   * 그래서 여기서 먼저 막고, **어디서 고치는지**까지 말한다.
   */
  const lengthBlockedMessage = imageRequestLengthBlock({
    userInstruction,
    anchorIntent: attachmentIntents?.anchor,
    personIntent: attachmentIntents?.person,
    styleIntent: attachmentIntents?.style,
  });

  /*
    **사진 없이 실물을 팔고 있다고 말한다**(N-2, 설계 §9.1).

    막지는 않는다. 개념 시안이 필요한 경우가 실제로 있다 — 아직 만들지 않은
    물건을 소개하거나 분위기만 먼저 보는 경우다. 막으면 그 사람들이 못 쓴다.
    대신 **실제와 다를 수 있다는 것과, 사진을 올리면 된다는 것**을 말한다.
  */
  /*
    **이 그림이 지금 문구로 만든 것인가**(N-5, 설계 §4.2).

    상세페이지는 글자가 이미지 안에 그려진다. 제목을 고쳐도 그림은 옛 글자를
    들고 있는데 아무 표시가 없었다 — 그대로 내보내면 **고친 글과 다른
    이미지**가 나간다.
  */
  const 그림낡음 = isImageStale(currentSection);

  const 개념시안 = conceptOnlyNotice({
    productKind: productKind as never,
    hasProductPhoto: startMode !== "text",
  });

  const pageWire = (): PageImageWire =>
    buildPageWire({
      // 글 경로의 앵커는 우리가 만든 대표 이미지다. 실물 제품이 아니다(U-03).
      anchorKind: startMode === "text" ? "key-visual" : "product-photo",
      // 사진 없이 실물을 팔 때를 가린다(N-2). 판단은 `page-wire.ts` 가 한다.
      productKind,
      imageModel,
      outputMode,
      look,
      userInstruction,
      preserveProduct,
      styleReference,
      attachmentIntents,
      pageContext,
      referenceModel: referenceModelImage,
      referenceModelUsage,
      // 둘 다 골랐을 때 누구를 쓸지. 안 넘기면 서버가 말없이 업로드를 쓴다(U-04).
      personSource,
    });

  /**
   * 섹션 이미지를 만든다. 대상을 넘기지 않으면 현재 섹션.
   *
   * 완료 시 setSections 는 인덱스가 아니라 섹션 키로 대상을 찾는다.
   * 생성이 도는 동안 사용자가 순서를 바꿀 수 있어, 인덱스로 되돌리면
   * 엉뚱한 섹션에 이미지가 박힌다.
   */
  const generateSectionImage = async (index: number): Promise<ImageGenerationOutcome> => {
    const section = sections[index];
    const sectionKey = sectionKeys[index];
    if (!section || !sectionKey) {
      return { ok: false };
    }

    // **인물을 쓸지는 여기서 정하지 않는다.** 두 호출이 각자 판단하면 언젠가
    // 갈린다 — 실제로 갈려서 일괄 생성에는 사람이 아예 안 들어갔다.
    // 사용자가 이 섹션에 대해 고른 값만 보내고, 판단은 조립기가 한다.
    const options = normalizeImageOptions(
      sectionOptions[sectionKey],
      referenceModelUsage === "all-sections" ? true : index === 0
    );

    if (lengthBlockedMessage) {
      setErrorMessage(lengthBlockedMessage);
      return { ok: false, stopBatch: true };
    }

    setGeneratingKeys((current) => (current.includes(sectionKey) ? current : [...current, sectionKey]));
    setErrorMessage("");
    const requestKey = retryRequestKeysRef.current[sectionKey] ?? randomId();
    retryRequestKeysRef.current[sectionKey] = requestKey;

    try {
      const response = await apiJson<PdpGenerateImageResponse>("/pdp/images", {
        method: "POST",
        headers: { "x-idempotency-key": requestKey },
        body: JSON.stringify({
          originalImageBase64: initialResult.originalImage,
          section,
          aspectRatio,
          desiredTone: desiredTone || undefined,
          sectionIndex: index,
          page: pageWire(),
          options: {
            ...options,
            isRegeneration: Boolean(section.generatedImage),
          },
          // 제목에 없는 낱말은 걸러서 보낸다. 그대로 보내면 모델이 강조할
          // 대상을 못 찾아 엉뚱한 곳이 강조된다.
          emphasisWords: keepWordsPresentIn(section.headline ?? "", options.emphasisWords ?? []),
          characterId,
          characterAngles,
        }),
      });
      delete retryRequestKeysRef.current[sectionKey];

      if (!response.ok) {
        setErrorMessage(response.message);
        const responseCode = String(response.code || "");
        // 같은 요청이 막혔다. 이미 만들어진 것이 서버에 있을 수 있다(K-05).
        if (shouldRecoverAfter(responseCode)) onDuplicateRequest?.();
        return {
          ok: false,
          stopBatch: [
            "quota_exceeded",
            // 팀 한도도 더 만들어 봐야 계속 막힌다. 남은 섹션을 줄줄이
            // 실패시키면 같은 알림만 열 번 뜬다.
            "team_quota_exceeded",
            "concurrent_limit",
            "pending",
            "suspended",
            "email_unconfirmed",
            "unauthenticated",
            "duplicate_request",
          ].includes(responseCode),
        };
      }

      setSections((current) =>
        applyToSectionByKey(current, sectionKeysRef.current, sectionKey, {
          generatedImage: toDataUrl(response.mimeType, response.imageBase64),
          /*
            **어느 문구로 만든 그림인지 함께 적는다**(N-5, 설계 §4.2).

            글자가 이미지 안에 그려지므로, 제목을 고치면 그림은 옛 글자를
            들고 있다. 자국이 없으면 화면이 그 사실을 알 길이 없어 **고친
            글과 다른 이미지가 그대로 나간다.**

            **보낸 섹션으로 찍는다.** 지금 화면의 것으로 찍으면 만드는 사이에
            문구를 고친 경우 처음부터 맞는 것처럼 보인다.
          */
          imageStamp: imageStampOf(section),
          qaWarnings: response.qa?.warnings,
          // 「경고가 없다」와 「검수를 못 돌렸다」는 다르다.
          qaStatus: response.qa?.status,
        }),
      );
      setNotice(`${getDisplaySectionName(section)} 이미지를 만들었습니다.`);
      return { ok: true };
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `${error.message} 같은 섹션을 다시 누르면 동일 요청으로 확인해 중복 차감을 막습니다.`
          : "이미지 응답을 확인하지 못했습니다. 다시 시도할 때 중복 차감을 방지합니다."
      );
      return { ok: false, stopBatch: true };
    } finally {
      setGeneratingKeys((current) => current.filter((key) => key !== sectionKey));
    }
  };

  const handleGenerateImage = async (targetIndex?: number) => {
    if (generationLockRef.current) return;
    const index = targetIndex ?? currentSectionIndex;
    const section = sections[index];
    if (!section) return;

    generationLockRef.current = true;
    if (section.generatedImage && onBeforeReplace) {
      try {
        if (!(await onBeforeReplace())) { generationLockRef.current = false; setErrorMessage("이전 결과를 보관하지 못했습니다. 다시 시도해 주세요."); return; }
      } catch {
        generationLockRef.current = false; setErrorMessage("이전 결과를 보관하지 못했습니다."); return;
      }
    }
    const startedAt = Date.now();
    setGenerationRun({
      mode: "single",
      status: "running",
      total: 1,
      completed: 0,
      failed: 0,
      skipped: 0,
      currentLabel: getDisplaySectionName(section),
      startedAt,
    });

    try {
      const outcome = await generateSectionImage(index);
      setGenerationRun({
        mode: "single",
        status: "finished",
        total: 1,
        completed: outcome.ok ? 1 : 0,
        failed: outcome.ok ? 0 : 1,
        skipped: 0,
        currentLabel: getDisplaySectionName(section),
        startedAt,
        endedAt: Date.now(),
      });
      if (outcome.ok) {
        setNotice(`${getDisplaySectionName(section)} 이미지 생성 완료 · 성공한 1장만 크레딧에서 차감됐습니다.`);
      }
    } finally {
      generationLockRef.current = false;
    }
  };

  /** 아직 이미지가 없는 섹션을 한 번에 만든다. */
  const handleGenerateAllMissing = async () => {
    if (generationLockRef.current) return;
    if (lengthBlockedMessage) {
      setErrorMessage(lengthBlockedMessage);
      return;
    }
    const targets = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => !section.generatedImage);

    if (!targets.length) return;

    generationLockRef.current = true;
    /**
     * **도는 동안 갤러리를 잠근다.**
     *
     * 배치는 `generatingKeys` 를 안 채우고 있었다. 그래서 `isBusy` 가 내내
     * false 였고, 5분짜리 배치가 도는 동안 카드에 스피너가 안 뜨며 순서 변경과
     * **삭제** 버튼이 열려 있었다. 도중에 섹션을 지우면 돌아온 결과가 붙을
     * 자리를 잃어 **이미 과금된 그림이 조용히 버려졌다.** 단건 경로는 처음부터
     * 이 열쇠를 채우고 있었다.
     */
    const targetKeys = targets
      .map(({ index }) => sectionKeys[index])
      .filter((key): key is string => Boolean(key));
    setGeneratingKeys((current) => [
      ...current,
      ...targetKeys.filter((key) => !current.includes(key)),
    ]);
    const startedAt = Date.now();
    const modelInfo = IMAGE_MODELS.find((m) => m.id === imageModel);
    let completed = 0;
    let failed = 0;
    let processed = 0;

    // 한 요청에 다 담지 않고 모델이 감당할 만큼씩 나눈다. 서버리스 함수 상한이
    // 300초인데 GPT 는 6장에 288초가 걸려, 한 번에 보내면 상한에 걸려 죽고
    // 예약해 둔 크레딧이 finalize 되지 못한 채 남는다.
    const chunks = chunkForModel(targets, imageModel);

    const describeRun = (status: GenerationRun["status"], label: string): GenerationRun =>
      describeBatchRun({
        status,
        label,
        total: targets.length,
        completed,
        failed,
        processed,
        startedAt,
        chunkCount: chunks.length,
        model: modelInfo,
      });

    setGenerationRun(describeRun("running", getDisplaySectionName(targets[0].section)));

    try {
      for (const chunk of chunks) {
        /*
          **다시 눌러도 같은 열쇠로 간다**(K-05).

          `apiJson` 은 머리글이 없으면 POST 마다 새 열쇠를 만든다. 그래서
          통신이 끊겨 다시 누르면 **새 예약**이 되어 이미 만든 것을 또 만들고
          또 받았다. 단건 경로는 섹션마다 열쇠를 붙잡아 두는데 일괄만 빠져
          있었다.
        */
        const chunkKeyId = batchRetryKeyId(chunk.map(({ section }) => section.section_id));
        const chunkRequestKey = retryRequestKeysRef.current[chunkKeyId] ?? randomId();
        retryRequestKeysRef.current[chunkKeyId] = chunkRequestKey;

        const response = await apiJson<BatchImagesResponse>("/pdp/images/batch", {
          method: "POST",
          headers: { "x-idempotency-key": chunkRequestKey },
          body: JSON.stringify({
            originalImageBase64: initialResult.originalImage,
            // 결과를 서버에 적을 때 무엇의 것인지 묶는다. 저장 전이면 안 싣는다.
            ...jobRequestFields(draftId, 0),
            sections: chunk.map(({ section }) => section),
            // 묶음 안 순서가 아니라 **페이지에서의 자리**를 보낸다. 인물 사진을
            // 「첫 섹션에만」 쓸 때 두 번째 묶음의 첫 장은 히어로가 아니다.
            sectionIndexes: chunk.map(({ index }) => index),
            aspectRatio,
            desiredTone: desiredTone || undefined,
            characterId,
            characterAngles,
            page: pageWire(),
            // 사용자가 섹션마다 고른 값. 전에는 일괄이 이것을 통째로 무시하고
            // style 을 lifestyle 로 박아 보냈다 — 한 장만 다시 만들면 studio 라
            // 같은 페이지 안에서 결이 갈렸다.
            optionsBySection: Object.fromEntries(
              chunk.map(({ section, index }) => [
                section.section_id,
                normalizeImageOptions(
                  sectionOptions[sectionKeys[index] ?? String(index)],
                  referenceModelUsage === "all-sections" ? true : index === 0,
                ),
              ]),
            ),
            /**
             * 섹션마다 제목이 다르므로 강조도 섹션별이다.
             *
             * **자리 차례로 보낸다.** `section_id` 로 묶으면 그 값이 겹칠 때
             * 두 섹션이 같은 강조어를 받는다 — AI 응답값이라 겹칠 수 있고,
             * `buildSectionKeys` 주석이 그 사실을 이미 못 박아 두었다.
             */
            emphasisWordsList: chunk.map(({ section, index }) => keepWordsPresentIn(
              section.headline ?? "",
              sectionOptions[sectionKeys[index] ?? String(index)]?.emphasisWords ?? [],
            )),
          }),
        });

        processed += chunk.length;

        if (!response.ok) {
          // 한 묶음이 막히면 다음 묶음도 같은 이유로 막힌다(크레딧 소진 등).
          // 계속 밀어붙이면 같은 오류만 반복하므로 여기서 멈춘다.
          failed += chunk.length;
          setErrorMessage(response.message ?? "일괄 생성에 실패했습니다.");
          // 같은 묶음이 막혔다. 이미 만들어진 것이 서버에 있을 수 있다(K-05).
          if (shouldRecoverAfter(response.code)) onDuplicateRequest?.();
          break;
        }

        /**
         * **자리 차례로 되돌린다. 단건 경로와 같은 규칙이다.**
         *
         * 예전에는 `section_id` 로 맵을 만들어 붙였는데, 그 값은 AI 응답값이라
         * 겹칠 수 있다(`buildSectionKeys` 주석). 겹치면 두 섹션이 같은 그림을
         * 받고, 게다가 아래가 전체 섹션을 훑기 때문에 **이번에 만들지도 않은
         * 섹션의 기존 이미지가 덮여 사라졌다.**
         *
         * 서버의 `results` 는 보낸 `sections` 와 자리가 그대로 맞물린다
         * (`settled.map((outcome, index) => …)`). 그 자리를 `sectionKeys` 로
         * 옮기면 생성 중에 순서가 바뀌어도 제 섹션을 찾는다.
         */
        const byKey = new Map<string, (typeof response.results)[number]>();
        /*
          **보낸 섹션도 같은 열쇠로 묶어 둔다**(N-5).

          그림에 어느 문구가 그려졌는지는 **보낸 것**이 안다. 지금 화면의
          것으로 자국을 찍으면, 만드는 사이에 문구를 고친 경우 처음부터
          맞는 것처럼 보인다.
        */
        const 보낸것 = new Map<string, (typeof chunk)[number]["section"]>();
        chunk.forEach(({ index, section: 보낸섹션 }, position) => {
          // 지금 배열을 본다. 오래된 것을 쓰면 짝이 어긋난다(A-16).
          const key = sectionKeysRef.current[index];
          const outcome = response.results[position];
          if (key && outcome) byKey.set(key, outcome);
          if (key) 보낸것.set(key, 보낸섹션);
        });
        setSections((current) =>
          current.map((item, position) => {
            const key = sectionKeysRef.current[position] ?? String(position);
            const outcome = byKey.get(key);
            if (!outcome?.ok) return item;
            return {
              ...item,
              generatedImage: toDataUrl(outcome.mimeType, outcome.imageBase64),
              // 어느 문구로 만든 그림인지 함께 적는다(N-5). 단건 경로와 같다.
              imageStamp: imageStampOf(보낸것.get(key) ?? item),
              qaWarnings: outcome.qa?.warnings,
              qaStatus: outcome.qa?.status,
            };
          }),
        );
        completed += response.succeeded;
        failed += response.requested - response.succeeded;

        setGenerationRun(
          describeRun("running", getDisplaySectionName(chunk[chunk.length - 1].section)),
        );
        if (response.stopBatch) {
          setErrorMessage("공급자 연결 또는 한도 문제로 남은 묶음을 중단했습니다. 성공한 이미지는 보관했습니다.");
          break;
        }
      }
    } catch (error) {
      failed += targets.length - processed;
      processed = targets.length;
      setErrorMessage(
        error instanceof Error ? `${error.message}` : "일괄 생성 응답을 확인하지 못했습니다.",
      );
    } finally {
      // 잠금을 반드시 푼다. 안 풀면 갤러리가 영영 잠긴 채로 남는다.
      setGeneratingKeys((current) => current.filter((key) => !targetKeys.includes(key)));
      setGenerationRun(
        describeRun(
          "finished",
          getDisplaySectionName(targets[Math.max(0, processed - 1)].section),
        ),
      );
      setNotice(
        `일괄 생성 결과: 성공 ${completed}장${failed ? ` · 실패 ${failed}장` : ""}. 성공한 ${completed}장에 대해 ${imageCreditUnits(imageModel, completed, { policy: creditPolicy })}${단위}이 차감됐습니다.`
      );
      generationLockRef.current = false;
    }
  };

  /**
   * 섹션 순서를 옮긴다.
   *
   * sections 와 sectionKeys 를 반드시 같이 옮겨야 한다. 한쪽만 옮기면
   * 키와 섹션의 짝이 어긋나 레이어가 남의 섹션에 붙는다.
   */
  const handleMoveSection = (from: number, to: number) => {
    if (generationLockRef.current) return;
    if (to < 0 || to >= sections.length || from === to) {
      return;
    }

    const move = <T,>(list: T[]) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    };

    setSections((current) => move(current));
    setSectionKeys((current) => move(current));

    // 보고 있던 섹션을 계속 따라간다.
    setCurrentSectionIndex((current) => {
      if (current === from) return to;
      if (from < current && to >= current) return current - 1;
      if (from > current && to <= current) return current + 1;
      return current;
    });
  };

  /** 섹션을 삭제한다. 그 섹션의 레이어·설정도 함께 지운다(남기면 유령 데이터). */
  const handleDeleteSection = async (index: number) => {
    if (generationLockRef.current) return;
    if (sections.length <= 1) {
      setErrorMessage("섹션은 최소 한 개는 있어야 합니다.");
      return;
    }

    generationLockRef.current = true;
    try {
      if (onBeforeReplace && !(await onBeforeReplace())) { setErrorMessage("이전 섹션을 보관하지 못해 삭제를 중단했습니다."); return; }
    } finally { generationLockRef.current = false; }
    const key = sectionKeys[index];
    setSections((current) => current.filter((_, i) => i !== index));
    setSectionKeys((current) => current.filter((_, i) => i !== index));
    setOverlaysBySection((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSectionOptions((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setCurrentSectionIndex((current) => Math.max(0, Math.min(index < current ? current - 1 : current, sections.length - 2)));
    setNotice("섹션을 삭제했습니다.");
  };

  /** 빈 섹션을 뒤에 추가한다. 키는 기존과 겹치지 않게 만든다. */
  const handleAddSection = () => {
    if (generationLockRef.current) return;
    // 서버와 같은 상한을 쓴다(설계 §9.1). 넘겨 만들면 다시 기획할 때 잘린다.
    if (sections.length >= MAX_PLANNED_SECTIONS) {
      setNotice(`한 페이지에 ${MAX_PLANNED_SECTIONS}장까지 만들 수 있습니다.`);
      return;
    }
    const section = createSectionFor(sections, designSystem);
    setSections((current) => [...current, section]);
    setSectionKeys((current) => [...current, section.section_id]);
    setNotice("빈 섹션을 추가했습니다. 문구를 넣고 이미지를 만들어 보세요.");
  };

  const handleAddTextOverlay = (
    translations: Record<PdpCopyLanguage, string>,
    type: CopyOverlayType | "default" = "default"
  ) => {
    if (!currentSection.generatedImage) {
      setErrorMessage("이미지를 먼저 생성해야 텍스트를 올릴 수 있습니다.");
      return;
    }

    // 자리별 서식은 copy-slots.ts 가 정한다. 여기서 또 정하면 두 곳이 갈라진다.
    // 목록 밖에서 부르는 경우(default)만 여기서 값을 준다.
    const style =
      type === "default"
        ? { fontSize: 20, fontWeight: "700", maxWidth: 280 }
        : overlayStyleFor(type);
    const normalizedTranslations =
      type === "keypoint"
        ? {
            ko: `• ${translations.ko}`,
            en: `• ${translations.en}`,
          }
        : translations;
    const displayText = normalizedTranslations[defaultCopyLanguage] || normalizedTranslations.ko;
    const defaultFontSize = style.fontSize;
    const defaultFontWeight = style.fontWeight;
    const estimatedBox = estimateOverlayBox(displayText, {
      fontSize: defaultFontSize,
      fontWeight: defaultFontWeight,
      fontFamily: DEFAULT_FONT_FAMILY,
      lineHeight: 1.2,
      maxWidth: style.maxWidth,
    });

    const newOverlay: TextOverlay = {
      id: randomId(),
      kind: "text",
      text: displayText,
      language: defaultCopyLanguage,
      translations: normalizedTranslations,
      // 이미 있는 것과 안 겹치게 비켜 놓는다. 전에는 늘 같은 자리라 포개졌다.
      // 상자 크기와 캔버스 높이까지 넘긴다. 자리만 보면 오른쪽·아래가 넘친다.
      ...nextLayerOrigin(currentLayers, { x: 52, y: 52 }, {
        width: estimatedBox.width,
        height: estimatedBox.height,
        canvasHeight: canvasHeightFor(aspectRatio),
      }),
      width: estimatedBox.width,
      height: estimatedBox.height,
      fontSize: defaultFontSize,
      color: "#ffffff",
      backgroundColor: shapeColorRecommendations[0] ?? "#102532",
      backgroundEnabled: false,
      backgroundOpacity: 0.72,
      backgroundRadius: 18,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: defaultFontWeight,
      textAlign: "left",
      lineHeight: 1.2,
      shadowEnabled: true,
      shadowColor: colorRecommendations.darkColor,
      shadowOpacity: 0.42,
      shadowBlur: 18,
      shadowOffsetY: 6,
    };

    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionKey]: [...(current[currentSectionKey] ?? []), normalizeTextOverlay(newOverlay)],
    }));
    setSelectedOverlayId(newOverlay.id);
    setWorkbenchState((current) => ({
      ...current,
      isOpen: true,
    }));
    setNotice("텍스트를 추가했습니다. 위치와 크기를 직접 조절해 레이아웃을 완성해 보세요.");
  };

  const handleAddShapeLayer = () => {
    if (!currentSection.generatedImage) {
      setErrorMessage("이미지를 먼저 생성해야 배경 사각형을 배치할 수 있습니다.");
      return;
    }

    const newShape: ShapeLayer = normalizeShapeLayer({
      id: randomId(),
      kind: "shape",
      ...nextLayerOrigin(currentLayers, { x: 64, y: 64 }, {
        width: 260,
        height: 120,
        canvasHeight: canvasHeightFor(aspectRatio),
      }),
      width: 260,
      height: 120,
      fillColor: shapeColorRecommendations[0] ?? colorRecommendations.darkColor,
      fillOpacity: 1,
      borderRadius: 0,
    });

    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionKey]: [...(current[currentSectionKey] ?? []), newShape],
    }));
    setSelectedOverlayId(newShape.id);
    setEditingOverlayId(null);
    setWorkbenchTab("layer");
    setWorkbenchState((current) => ({
      ...current,
      isOpen: true,
    }));
    setNotice("배경 사각형을 추가했습니다. 드래그와 리사이즈로 자유롭게 레이아웃을 만들 수 있습니다.");
  };

  const updateOverlay = (overlayId: string, updates: Partial<CanvasLayer>) => {
    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionKey]: (current[currentSectionKey] ?? []).map((overlay) =>
        overlay.id === overlayId ? normalizeCanvasLayer({ ...overlay, ...updates }) : overlay
      ),
    }));
  };

  const deleteOverlay = (overlayId: string) => {
    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionKey]: (current[currentSectionKey] ?? []).filter((overlay) => overlay.id !== overlayId),
    }));
    if (selectedOverlayId === overlayId) {
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
    }
  };

  const handleResizeStart = (overlay: CanvasLayer) => {
    resizeSessionRef.current[overlay.id] = {
      width: toNumericSize(overlay.width, 320),
      height: toNumericSize(overlay.height, 92),
      fontSize: isTextLayer(overlay) ? overlay.fontSize : 0,
    };
  };

  /** 크기 조절이 실제로 바꾸는 칸들. `Partial<CanvasLayer>` 로 그대로 쓰인다. */
  type ResizeUpdates = { x?: number; y?: number; width?: number; height?: number; fontSize?: number };

  /**
   * 이 크기 조절이 만드는 값.
   *
   * **계산과 확정을 갈랐다**(B-12-c). 끄는 동안은 이 값을 임시 자리에만 담고,
   * 놓을 때 한 번 확정한다. 전에는 프레임마다 확정했다.
   */
  const resizeUpdates = (
    overlay: CanvasLayer,
    direction: string,
    ref: HTMLElement,
    position: { x: number; y: number }
  ): ResizeUpdates => {
    const base = resizeSessionRef.current[overlay.id] ?? {
      width: toNumericSize(overlay.width, 320),
      height: toNumericSize(overlay.height, 92),
      fontSize: isTextLayer(overlay) ? overlay.fontSize : 0,
    };

    const nextWidth = ref.offsetWidth;
    const nextHeight = ref.offsetHeight;
    const isHorizontalOnly = direction === "left" || direction === "right";
    const isVerticalOnly = direction === "top" || direction === "bottom";

    if (isHorizontalOnly) return { width: nextWidth, x: position.x };
    if (isVerticalOnly) return { height: nextHeight, y: position.y };
    if (isShapeLayer(overlay)) {
      return { width: nextWidth, height: nextHeight, x: position.x, y: position.y };
    }

    const scale = Math.max(nextWidth / Math.max(base.width, 1), nextHeight / Math.max(base.height, 1));
    return {
      width: nextWidth,
      height: nextHeight,
      x: position.x,
      y: position.y,
      fontSize: clampValue(Math.round(base.fontSize * scale), 10, 180),
    };
  };

  const handleResize = (
    overlay: CanvasLayer,
    direction: string,
    ref: HTMLElement,
    position: { x: number; y: number }
  ) => {
    updateOverlay(overlay.id, resizeUpdates(overlay, direction, ref, position));
  };

  /** 크기를 바꾸는 중에 보여 줄 값. 확정하지 않는다. */
  const previewResize = (
    overlay: CanvasLayer,
    direction: string,
    ref: HTMLElement,
    position: { x: number; y: number }
  ): LayerPreview => {
    const updates = resizeUpdates(overlay, direction, ref, position);
    return {
      id: overlay.id,
      x: updates.x ?? toNumericSize(overlay.x, 0),
      y: updates.y ?? toNumericSize(overlay.y, 0),
      width: updates.width,
      height: updates.height,
      fontSize: updates.fontSize,
    };
  };

  const handleResizeStop = (overlayId: string) => {
    delete resizeSessionRef.current[overlayId];
  };

  const handleOverlayDrag = (overlay: CanvasLayer, x: number, y: number) => {
    updateOverlay(overlay.id, { x, y });
  };

  /**
   * 섹션 한 장을 파일로 굽는다.
   *
   * **얹은 것이 없으면 다시 굽지 않는다.** 원본 바이트를 그대로 준다 — 다시
   * 구우면 JPEG 로 바뀌며 손실이 나는데, 글자도 도형도 없으면 그럴 이유가 없다.
   *
   * 얹은 것이 있으면 **원본 해상도로** 합친다. 전에는 캔버스 폭(최대 460px)에
   * 2를 곱해 구웠다 — 1536px 로 만든 것이 920px 로 나갔다(폭 60%, 넓이 36%).
   * 레이어 좌표가 캔버스 폭 기준이라, 배율만 원본에 맞추면 배치는 그대로 두고
   * 해상도만 되찾는다.
   */

  const captureSectionBlob = async (sectionIndex: number) => {
    const section = sections[sectionIndex];
    if (!section?.generatedImage) {
      throw new Error("이미지가 없는 섹션은 다운로드할 수 없습니다.");
    }

    const layers = overlaysBySection[sectionKeys[sectionIndex] ?? String(sectionIndex)] ?? [];
    const mimeType = mimeTypeOfDataUrl(section.generatedImage);

    if (!needsRecomposite(layers)) {
      // 원본 그대로. 형식도 바꾸지 않는다.
      const response = await fetch(section.generatedImage);
      return { blob: await response.blob(), mimeType, recomposited: false };
    }

    // 붙어 있으면 지금 값을, 아니면 마지막으로 잰 값을 쓴다. 둘 다 없을 때만
    // 기본 폭으로 떨어진다(레이어를 한 번도 안 놓은 작업이라 어긋날 것도 없다).
    const width = imageContainerRef.current?.clientWidth || lastCanvasWidthRef.current || 460;
    // **한 번만 읽는다.** 전에는 `buildExportNode` 안에서 한 번, 여기서 또 한 번
    // 같은 4~5MB data URL 을 디코드했다.
    const { node: exportNode, naturalWidth } = await buildExportNode({
      imageSrc: section.generatedImage,
      width,
      layers,
    });

    document.body.appendChild(exportNode);

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      const canvas = await html2canvas(exportNode, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: exportScaleFor({ naturalWidth, canvasWidth: width }),
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });

      if (!blob) {
        throw new Error("다운로드용 이미지를 만들지 못했습니다.");
      }

      return { blob, mimeType: "image/jpeg", recomposited: true };
    } finally {
      exportNode.remove();
    }
  };

  /**
   * 만든 섹션을 계정 라이브러리에 **한 작업으로** 올린다.
   *
   * **생성이 끝나면 자동으로 부른다**(2026-09-23 사용자: 「생성 완료된 상세페이지
   * 이미지들은 라이브러리에 자동 저장되어야 합니다」). 단추로도 부를 수 있다 —
   * 한 장을 다시 만들거나 글자를 얹은 뒤 그 판을 남기고 싶을 때다.
   *
   * **한 페이지는 한 작업이다.** 전에는 묶음마다 새 작업이 되어 「(1/3)」처럼
   * 여러 줄로 흩어졌다. 모든 묶음에 같은 `sourceId` 를 실어 서버가 이어 붙인다.
   *
   * 브라우저 초안 저장("작업 저장하기")과는 다른 동작이다. 이쪽은 서버에 남아
   * 다른 기기에서도 보이고, 브라우저를 지워도 사라지지 않는다.
   */
  const handleSaveToLibrary = async ({ auto = false }: { auto?: boolean } = {}) => {
    if (!libraryEntries.length) {
      if (!auto) setErrorMessage("라이브러리에 저장할 이미지가 아직 없습니다.");
      return;
    }
    // 자동 저장과 단추가 겹치면 같은 판이 두 번 올라간다.
    if (librarySavingRef.current) return;

    const versionKey = currentLibraryKey;
    const total = libraryEntries.length;
    const pending = pendingLibraryUpload(libraryProgressRef.current, versionKey, total);
    /*
      자동 저장은 이미 올린 판이면 멈춘다. **단추는 늘 서버에 묻는다** — 그사이
      라이브러리에서 지웠다면 다시 올릴 수 있어야 한다(2차 독립 리뷰).
    */
    if (pending.done && auto) return;

    const recordProgress = (sent: number) => {
      const progress = { key: versionKey, sent };
      libraryProgressRef.current = progress;
      setLibraryProgress(progress);
    };

    librarySavingRef.current = true;
    setIsSavingToLibrary(true);
    if (!auto) setErrorMessage("");
    try {
      /*
        **작업 열쇠는 그림으로 짓는다**(`libraryWorkId`). 표의 칸이 uuid 이고,
        초안 id 는 도중에 생기거나 바뀌어 같은 페이지를 두 작업으로 가른다.

        **먼저 서버에 몇 장까지 있는지 묻는다.** 다시 연 초안은 무엇을 올렸는지
        모른다 — 묻지 않으면 이미 있는 장을 또 굽고 또 보낸다.
      */
      const sourceId = libraryWorkId(libraryVersionSections);
      const probe = await apiJson<{ ok: boolean; imageCount?: number }>(`/library?sourceId=${sourceId}`);
      // **서버가 기준이다.** 못 물었으면 이 화면이 기억하는 곳부터 보낸다.
      let sent = probe.ok ? Math.min(Math.max(0, probe.imageCount ?? 0), total) : pending.from;
      if (sent >= total) {
        recordProgress(total);
        if (!auto) setNotice("이 상세페이지는 이미 라이브러리에 저장되어 있습니다.");
        return;
      }

      /*
        **얹은 글자와 도형을 함께 저장한다.** 다운로드·ZIP 은 합쳐서 굽는데
        라이브러리만 안 합치면, 같은 작업인데 내려받은 것과 저장된 것이 다르다.

        **한 장씩 굽는다.** html2canvas 는 호출마다 문서 전체를 복제한다 —
        동시에 여덟 장을 돌리면 휴대폰에서 탭이 죽는다.

        **못 구운 것은 원본 바이트로 올린다.** 원본도 못 읽으면 **거기서 멈춘다**
        — 건너뛰면 뒤의 장이 한 칸씩 당겨져 섹션 번호와 자리가 어긋난다.
      */
      const images: Array<{ base64: string; mimeType: string }> = [];
      const 원본으로: string[] = [];
      let 못읽음 = "";

      for (const { section, index } of libraryEntries.slice(sent)) {
        try {
          const captured = await captureSectionBlob(index);
          images.push({ base64: await blobToBase64(captured.blob), mimeType: captured.mimeType });
        } catch {
          const [, mimeType = "image/png", base64 = ""] =
            /^data:([^;]+);base64,(.*)$/.exec(section.generatedImage ?? "") ?? [];
          if (!base64) {
            못읽음 = getDisplaySectionName(section);
            break;
          }
          images.push({ base64, mimeType });
          원본으로.push(getDisplaySectionName(section));
        }
      }

      // 앞단이 요청 본문을 10MB 에서 자른다(운영 로그). 그 안에 맞춰 나눠 보낸다.
      const title = initialResult.blueprint.executiveSummary?.slice(0, 60) || "상세페이지 작업";
      const startedAt = sent;
      let failure = "";

      for (const batch of requestBatches(images)) {
        const response = await apiJson<{
          ok: boolean;
          alreadySaved?: boolean;
          conflict?: boolean;
          totalCount?: number;
          message?: string;
        }>("/library", {
          method: "POST",
          // 만든 과정을 함께 보낸다. **무엇을 남길지는 서버가 고른다**
          // (`api/library/work-process.ts`) — 여기서 골라 보내면 화면마다
          // 규칙이 갈리고, 언젠가 원본 사진이 섞여 들어간다.
          body: JSON.stringify({
            title,
            tool: "create",
            sourceId,
            // 몇 번째 장부터인지 알린다. 서버가 이미 있는 장을 또 붙이지 않는다.
            startPosition: sent,
            ...pdpProcessSource(initialResult, aspectRatio),
            images: batch,
          }),
        });
        if (!response.ok) {
          // 장수가 어긋났다(다른 탭이 올렸거나 응답을 놓쳤다). 서버의 장수부터 다시 보낸다.
          if (response.conflict && typeof response.totalCount === "number") {
            recordProgress(Math.min(response.totalCount, total));
          }
          failure = response.message ?? "라이브러리에 저장하지 못했습니다.";
          break;
        }
        sent = Math.min(total, Math.max(sent + batch.length, response.alreadySaved ? response.totalCount ?? 0 : 0));
        recordProgress(sent);
      }

      if (!failure && 못읽음) {
        failure = `${못읽음} 이미지를 읽지 못해 거기서 멈췄습니다. 그 섹션을 다시 만든 뒤 저장해 주세요.`;
      }

      if (sent > startedAt && !failure) {
        const 덧붙임 = 원본으로.length
          ? ` (${원본으로.join(", ")}은(는) 얹은 글자 없이 원본으로 저장했습니다)`
          : "";
        const 알림 = `라이브러리에 ${sent}장을 한 작업으로 저장했습니다.${덧붙임}`;
        // 자동 저장은 방금 뜬 「성공 N장 · 크레딧 차감」 안내를 지우지 않고 덧붙인다.
        setNotice((previous) => (auto && previous ? `${previous} · ${알림}` : 알림));
      }
      if (failure) {
        setErrorMessage(
          sent > 0
            ? `라이브러리에 ${sent}/${total}장까지 저장했습니다. 「라이브러리에 저장」을 다시 누르면 나머지를 이어서 올립니다. (${failure})`
            : failure,
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "라이브러리에 저장하지 못했습니다.",
      );
    } finally {
      librarySavingRef.current = false;
      setIsSavingToLibrary(false);
    }
  };

  saveToLibraryRef.current = handleSaveToLibrary;

  /**
   * 섹션 한 장을 내려받는다. 얹은 글자까지 구운 완성본이다.
   *
   * 전에는 「현재 섹션」만 받을 수 있었는데, 갤러리에서는 현재 섹션이 늘 첫
   * 장이라 **무엇을 눌러도 첫 장이 받아졌다**(2026-09-23 사용자). 이제 확대
   * 창이 자기 장 번호로 부른다.
   */
  const downloadSection = async (index: number) => {
    const section = sections[index];
    if (!section?.generatedImage) return;
    try {
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
      setActiveColorPalette(null);
      const captured = await captureSectionBlob(index);
      downloadBlob(
        captured.blob,
        `${String(index + 1).padStart(2, "0")}-${exportFileName(section.section_id, captured.mimeType, captured.recomposited)}`,
      );
      setNotice(`${getDisplaySectionName(section)} 이미지를 다운로드했습니다.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이미지를 다운로드하지 못했습니다.");
    }
  };

  /**
   * **이어보기를 긴 한 장으로 내려받는다**(2026-09-23 사용자).
   *
   * 상세페이지는 결국 위아래로 붙인 긴 한 장으로 쇼핑몰에 올라간다. 얹은
   * 글자까지 구운 장을 틈 없이 쌓는다. 한 장씩 굽는 것은 ZIP 과 같은 이유다.
   */
  const handleDownloadStitched = async () => {
    if (!libraryEntries.length) {
      setErrorMessage("다운로드할 이미지가 아직 없습니다.");
      return;
    }
    try {
      setIsDownloadingStitched(true);
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
      setActiveColorPalette(null);

      /*
        **두 번에 나눠 굽는다**(독립 리뷰 MEDIUM). 전에는 모든 장의 비트맵을
        쥔 채 그려, 8장이면 비트맵만 135MB 에 캔버스가 그만큼 더 들었다 —
        ZIP·라이브러리 저장을 한 장씩으로 바꾼 이유(휴대폰 탭이 죽음)가 여기서
        되살아났다. 먼저 크기만 재고 바로 놓은 뒤, 한 장씩 다시 구워 그리고 놓는다.
      */
      const sizes: Array<{ width: number; height: number }> = [];
      for (const { index } of libraryEntries) {
        const bitmap = await createImageBitmap((await captureSectionBlob(index)).blob);
        sizes.push({ width: bitmap.width, height: bitmap.height });
        bitmap.close();
      }

      // 아이폰·아이패드 사파리는 캔버스 넓이 한도가 약 1,670만 픽셀이다.
      const isAppleMobile = /iP(hone|ad|od)/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const layout = stitchLayout(sizes, isAppleMobile ? { maxArea: 16_000_000 } : {});
      const canvas = document.createElement("canvas");
      canvas.width = layout.width;
      canvas.height = layout.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이어보기 이미지를 만들지 못했습니다.");
      // 투명한 PNG 가 섞여도 JPEG 에서 검게 나오지 않게 바탕을 깐다.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, layout.width, layout.height);

      for (const [position, { index }] of libraryEntries.entries()) {
        const bitmap = await createImageBitmap((await captureSectionBlob(index)).blob);
        const row = layout.rows[position];
        context.drawImage(bitmap, 0, row.y, layout.width, row.height);
        bitmap.close();
      }

      /*
        **JPEG 로 굽는다.** 폭 1536 에 높이가 2만 픽셀을 넘는 사진이라 PNG 면
        수십 MB 가 되어 쇼핑몰 업로드 한도를 넘는다. 품질은 0.95 로 둔다.
      */
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
      // 캔버스를 바로 놓는다. 들고 있으면 그만큼 메모리가 남는다.
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error("이어보기 이미지를 만들지 못했습니다. 섹션 수를 줄여 다시 시도해 주세요.");
      downloadBlob(blob, `pdp-stitched-${new Date().toISOString().slice(0, 10)}.jpg`);
      setNotice(`${libraryEntries.length}개 섹션을 이어 붙인 한 장을 다운로드했습니다.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이어보기 이미지를 다운로드하지 못했습니다.");
    } finally {
      setIsDownloadingStitched(false);
    }
  };

  const handleDownloadAll = async () => {
    const downloadableSections = sections
      .map((section, index) => ({ section, index }))
      .filter((entry) => Boolean(entry.section.generatedImage));

    if (!downloadableSections.length) {
      setErrorMessage("다운로드할 이미지가 아직 없습니다.");
      return;
    }

    try {
      setIsDownloadingAll(true);
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
      setActiveColorPalette(null);

      const zip = new JSZip();

      for (const { section, index } of downloadableSections) {
        const captured = await captureSectionBlob(index);
        const name = exportFileName(section.section_id, captured.mimeType, captured.recomposited);
        // 순서를 앞에 붙인다. 이어 붙일 때 차례가 섞이면 안 된다.
        zip.file(`${String(index + 1).padStart(2, "0")}-${name}`, captured.blob);
      }

      const archive = await zip.generateAsync({ type: "blob" });
      downloadBlob(archive, `pdp-sections-${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice(`${downloadableSections.length}개 섹션 이미지를 ZIP으로 다운로드했습니다.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "전체 이미지를 ZIP으로 다운로드하지 못했습니다.");
    } finally {
      setIsDownloadingAll(false);
    }
  };

  // 셸이 <main> 을 제공하므로 여기서는 열지 않는다(이전에는 <main> 이 중첩됐다).
  return (
    <div className="min-w-0" onClick={clearLayerSelection}>
      <header
        className="mb-4 flex flex-wrap items-start gap-3"
        onClick={stopShellClick}
      >
        <div className="min-w-0">
          <h1 className="text-h1">
            {screen === "gallery" ? "섹션 검토" : `${getDisplaySectionName(currentSection)} 편집`}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {screen === "gallery"
              ? "만든 섹션을 한눈에 보고, 다시 만들거나 편집할 섹션을 고르세요."
              : outputMode === "full-image"
                ? "완성된 섹션이에요. 확인하고 바로 내보내면 됩니다. 문구는 이미 이미지에 포함돼 있어요."
                : "섹션 컷을 고르고 텍스트를 배치한 뒤 바로 완성본을 저장하세요."}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <Badge variant="secondary">비율 {aspectRatio}</Badge>
          <Badge variant="secondary">톤 {toneLabel}</Badge>
          <Badge variant="green">
            생성됨 {generatedCount}/{sections.length}
          </Badge>
          {saveState === "saving" ? (
            <Badge variant="secondary">저장 중</Badge>
          ) : lastSavedAt ? (
            <Badge variant="secondary">최근 저장 {formatSavedAt(lastSavedAt)}</Badge>
          ) : null}
        </div>
      </header>

      <div className="mb-4" onClick={stopShellClick}>
        {/*
          3·4단계는 편집기 안에서 오간다. 1·2단계는 화면을 벗어나므로 부모가 받는다.
          작업은 자동 저장되므로 되돌아가도 잃는 것이 없다.
        */}
        <StepBar
          steps={CREATE_STEPS[startMode]}
          current={screen === "gallery" ? "sections" : "edit"}
          onJump={(id) => {
            if (id === "sections") setScreen("gallery");
            else if (id === "edit") setScreen("editor");
            else if (id === "upload" || id === "analyze") onJumpStep?.(id);
          }}
        />
      </div>

      {/*
        **도구 막대를 잘 보이게 한다**(2026-09-23 사용자: 「설정으로, 펼치기, 편집
        등 버튼이 나와 있는 곳이 잘 안 보입니다」).

        전에는 전부 테두리 없는 작은 글자(`ghost`·12px)라 막대인지도 몰랐다.
        단추마다 테두리·바탕·14px 굵은 글자를 주고, 하는 일끼리 묶었다 —
        (아이콘은 안 붙인다 — 2026-09-22 사용자 지시, `section-start-guide.test`)
        왼쪽은 오가기, 가운데는 저장, 오른쪽은 내려받기다.
      */}
      <div
        className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5 shadow-[var(--shadow-ring)]"
        onClick={stopShellClick}
      >
        <Button variant="outline" className={toolbarButtonClass} disabled={isGenerating} onClick={onReset}>
          설정으로
        </Button>
        <div
          role="group"
          aria-label="보기 전환"
          className="flex gap-1 rounded-lg border border-border bg-background p-1"
        >
          {([
            { value: "gallery" as const, label: "갤러리" },
            { value: "editor" as const, label: "편집" },
          ]).map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={screen === item.value}
              onClick={() => setScreen(item.value)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-3.5 text-sm font-semibold transition-colors",
                screen === item.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {onOpenSettings ? (
          <Button variant="outline" className={toolbarButtonClass} onClick={onOpenSettings}>
            설정
          </Button>
        ) : null}

        <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />

        {onUndo ? (
          <Button variant="outline" className={toolbarButtonClass} disabled={isGenerating} onClick={onUndo}>
            변경 전으로 되돌리기
          </Button>
        ) : null}
        {onManualSave ? (
          <Button variant="outline" className={toolbarButtonClass} disabled={saveState === "saving"} onClick={onManualSave}>
            {saveState === "saving" ? <Loader2 className="animate-spin" /> : null}
            작업 저장하기
          </Button>
        ) : null}
        <Button
          variant="outline"
          className={toolbarButtonClass}
          disabled={!generatedCount || isSavingToLibrary}
          onClick={() => void handleSaveToLibrary()}
          title="계정에 한 작업으로 올려 다른 기기에서도 볼 수 있게 합니다. 생성이 끝나면 자동으로 올라갑니다."
        >
          {isSavingToLibrary ? <Loader2 className="animate-spin" /> : null}
          {isSavingToLibrary
            ? "라이브러리에 저장 중"
            : librarySaved
              ? "라이브러리에 저장됨"
              : libraryProgress
                ? "바뀐 내용 라이브러리에 저장"
                : "라이브러리에 저장"}
        </Button>
        {/* 위 버튼은 상세페이지 보관함으로 간다. 이건 참고 이미지로 넣어
            카드뉴스·포스터가 다음 작업의 기준으로 쓸 수 있게 한다. */}
        <SaveImagesToLibrary
          images={sections
            .filter((section) => Boolean(section.generatedImage))
            .map((section, index) => ({
              fileUrl: section.generatedImage as string,
              title: `상세페이지 ${index + 1}`,
            }))}
          disabled={!generatedCount}
          buttonVariant="outline"
          buttonClassName={toolbarButtonClass}
        />

        {/*
          **내려받기는 두 가지만 둔다**(2026-09-23 사용자).

          「현재 섹션 다운로드」는 갤러리에서 늘 첫 장을 받았다 — 갤러리에는
          「현재 섹션」이 없는데 첫 장이 그 자리를 차지하고 있었다. 한 장씩은
          확대 창에서 받는다. 여기에는 전부(ZIP)와 이어 붙인 한 장만 둔다.
        */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className={toolbarButtonClass}
            disabled={!generatedCount || isDownloadingStitched}
            onClick={() => void handleDownloadStitched()}
            title="이어보기처럼 위아래로 붙인 긴 한 장(JPG)으로 받습니다"
          >
            {isDownloadingStitched ? <Loader2 className="animate-spin" /> : null}
            이어보기 다운로드
          </Button>
          <Button
            className="h-9 gap-1.5 px-4 text-sm font-semibold"
            disabled={!generatedCount || isDownloadingAll}
            onClick={() => void handleDownloadAll()}
            title="섹션마다 한 장씩 ZIP 으로 받습니다"
          >
            {isDownloadingAll ? <Loader2 className="animate-spin" /> : null}
            전체 다운로드
          </Button>
        </div>
      </div>

      {showSaveToast ? (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background shadow-[var(--shadow-elevate)]">
          저장되었습니다.
        </div>
      ) : null}

      <div className="mb-4 grid gap-2" onClick={stopShellClick}>
        {generationRun ? (
          <div
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              generationRun.status === "running"
                ? "border-primary/25 bg-primary/5"
                : generationRun.failed || generationRun.skipped
                  ? "border-warning/25 bg-warning/5"
                  : "border-primary/20 bg-primary/5"
            )}
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center gap-2">
              {generationRun.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
              <strong>
                {generationRun.status === "running"
                  ? generationRun.mode === "batch"
                    ? `${generationRun.total}장 만드는 중`
                    : `${generationRun.currentLabel} 생성 중`
                  : generationRun.failed || generationRun.skipped
                    ? "이미지 생성 부분 완료"
                    : "이미지 생성 완료"}
              </strong>
              <Badge variant="secondary">
                {`${generationRun.completed + generationRun.failed}/${generationRun.total} 처리`}
              </Badge>
              {generationRun.status === "running" && generationRun.expectedSeconds ? (
                <Badge variant="secondary">{`약 ${Math.max(1, Math.round(generationRun.expectedSeconds / 60))}분 남음`}</Badge>
              ) : null}
              <Badge variant="outline"><ElapsedTime startedAt={generationRun.startedAt} endedAt={generationRun.endedAt} /></Badge>
            </div>
            {/*
              끝난 묶음만큼은 확실히 안다 — 그만큼은 채운다.
              지금 만들고 있는 묶음 안에서 몇 장 끝났는지는 알 수 없으므로,
              가짜 퍼센트를 올리는 대신 그 구간에 왕복 막대를 얹어 "돌고 있음"만 알린다.
            */}
            <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{
                  width: `${Math.round(((generationRun.completed + generationRun.failed) / generationRun.total) * 100)}%`,
                }}
              />
              {generationRun.status === "running" && generationRun.mode === "batch" ? (
                <div className="absolute inset-0 h-full w-1/3 rounded-full bg-primary/40 animate-[pdp-indeterminate_1.4s_ease-in-out_infinite]" />
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              성공 {generationRun.completed}장 · 실패 {generationRun.failed}장{generationRun.skipped ? ` · 미시도 ${generationRun.skipped}장` : ""} · 성공한 이미지만 차감되며 {generationRun.completed}장이면 {imageCreditUnits(imageModel, generationRun.completed, { policy: creditPolicy })}{단위}입니다.
            </p>
          </div>
        ) : null}
        {개념시안.conceptOnly ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-sm">
            {개념시안.message}
          </div>
        ) : null}
        {recoveredFailures?.length ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-sm">
            <p className="font-bold">만들어지지 않은 섹션 {recoveredFailures.length}장</p>
            <p className="mt-0.5 text-muted-foreground">
              아래 섹션만 다시 만들면 됩니다. 이미 만든 이미지는 그대로 있고 다시 차감되지 않습니다.
            </p>
            <ul className="mt-2 space-y-1.5">
              {recoveredFailures.map((line) => (
                <li key={line.label}>
                  <span className="font-bold">{line.label}</span>{" "}
                  <Badge variant={line.retryable ? "secondary" : "destructive"}>
                    {line.retryable ? "다시 해 보세요" : "조치가 필요합니다"}
                  </Badge>
                  <p className="mt-0.5 text-muted-foreground">{line.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {recoveredNotice ? (
          <div className="rounded-md border border-primary/25 bg-primary-soft px-3.5 py-2.5 text-sm text-foreground">
            {recoveredNotice}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-md bg-card px-3.5 py-2.5 text-sm text-muted-foreground shadow-[var(--shadow-ring)]">
            {notice}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm">
            <AlertCircle size={16} className="mt-0.5 flex-none text-destructive" />
            {errorMessage}
          </div>
        ) : null}
      </div>

      {screen === "gallery" ? (
        <div onClick={stopShellClick}>
          <SectionGallery
            sections={sections}
            sectionKeys={sectionKeys}
            imageModel={imageModel}
            generatingKeys={generatingKeys}
            layerCounts={layerCounts}
            // 개수만 넘기면 갤러리가 얹은 글자를 못 그린다.
            overlaysBySection={overlaysBySection}
            onGenerate={(index) => void handleGenerateImage(index)}
            onGenerateAllMissing={() => void handleGenerateAllMissing()}
            onEdit={(index) => {
              setCurrentSectionIndex(index);
              setScreen("editor");
            }}
            onDownload={downloadSection}
            onMove={handleMoveSection}
            onDelete={handleDeleteSection}
            onAdd={handleAddSection}
            onGoEdit={() => {
              // 아직 안 만든 섹션이 있어도 만든 것부터 다듬을 수 있게 둔다.
              const firstReady = sections.findIndex((section) => section.generatedImage);
              if (firstReady >= 0) {
                setCurrentSectionIndex(firstReady);
              }
              setScreen("editor");
            }}
            getName={getDisplaySectionName}
            getGoal={getDisplaySectionGoal}
          />
        </div>
      ) : (
      <div className="grid items-start gap-4 xl:grid-cols-[clamp(240px,18vw,300px)_minmax(0,1fr)]">
        {/*
          **왼쪽 칸이 자기 폭을 넘지 않게 한다**(2026-09-23 사용자: 「겹치고 안 보인다」).

          격자의 칸 크기는 기본으로 **내용 중 가장 긴 줄**이다(`min-width: auto`).
          섹션 목록의 설명은 한 줄로 자르게(`truncate`) 해 두었지만, 자르기 전의 긴
          줄이 그 칸을 넓혀서 왼쪽 카드들이 300px 칸을 넘어 350px 폭으로 밀려 나왔다.
          `sticky` 라 겹칠 때 위에 그려져, 가운데 편집 화면의 제목과 도구 단추를
          덮었다. 칸마다 `minmax(0, 1fr)` 로 「내용보다 작아져도 된다」를 적는다.
        */}
        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 xl:sticky xl:top-6" onClick={stopShellClick}>
          <div className="rounded-lg bg-card p-4 shadow-[var(--shadow-ring)]">
            <p className="text-meta text-subtle-foreground">현재 섹션</p>
            <h2 className="text-h2">{getDisplaySectionName(currentSection)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {getDisplaySectionGoal(currentSection)}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-background p-2.5 shadow-[var(--shadow-ring)]">
                <span className="block text-meta text-subtle-foreground">현재 섹션</span>
                <strong className="text-sm">
                  {currentSectionIndex + 1}/{sections.length}
                </strong>
              </div>
              <div className="rounded-md bg-background p-2.5 shadow-[var(--shadow-ring)]">
                <span className="block text-meta text-subtle-foreground">레이어</span>
                <strong className="text-sm">{currentLayers.length}</strong>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-card p-4 shadow-[var(--shadow-ring)]">
            <p className="mb-2 text-meta text-subtle-foreground">섹션 목록</p>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {sections.map((section, index) => {
                const isCurrent = index === currentSectionIndex;

                return (
                  <button
                    key={section.section_id}
                    type="button"
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => setCurrentSectionIndex(index)}
                    className={cn(
                      "flex w-full min-w-0 items-start gap-2 rounded-md p-2 text-left transition-colors",
                      isCurrent
                        ? "bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]"
                        : "hover:bg-background"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-bold",
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : section.generatedImage
                            ? "bg-primary-soft text-primary"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {section.generatedImage && !isCurrent ? <CheckCircle2 size={12} /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">
                        {getDisplaySectionName(section)}
                      </strong>
                      <small className="block truncate text-xs text-muted-foreground">
                        {getDisplaySectionGoal(section) || "전환 목적을 정리한 섹션"}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <details className="group rounded-lg bg-card p-4 shadow-[var(--shadow-ring)]">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-h3">
              AI 분석 요약 보기
            </summary>
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">
                {initialResult.blueprint.executiveSummary}
              </p>

              {blueprintList.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {blueprintList.map((item) => (
                    <Badge key={item} variant="secondary">
                      {item}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {/*
                심사 결과가 있으면 그것만 보여준다. blueprint.scorecard 는 구성안을
                쓴 호출이 같은 자리에서 스스로 매긴 점수라 검증이 아니다. 등급(A/B)이
                붙어 있어 오히려 더 권위 있어 보이는데, 둘을 나란히 두면 사용자가
                믿을 것과 못 믿을 것을 구별할 수 없다.
              */}
              {review ? (
                <div className="mt-3">
                  <ReviewPanel review={review} blueprint={initialResult.blueprint} />
                </div>
              ) : (
                <ScorecardPanel scorecard={initialResult.blueprint.scorecard} />
              )}
            </div>
          </details>
        </aside>

        <section className="min-w-0">
          <article className="rounded-lg bg-card p-4 shadow-[var(--shadow-ring)]">
            <div className="mb-3 flex flex-wrap items-start gap-3">
              <div className="min-w-0">
                <p className="text-meta text-subtle-foreground">편집 섹션</p>
                <h2 className="text-h2">{getDisplaySectionName(currentSection)}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {getDisplaySectionGoal(currentSection)}
                </p>
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="이전 섹션"
                  disabled={currentSectionIndex === 0}
                  onClick={() => setCurrentSectionIndex((current) => Math.max(0, current - 1))}
                >
                  <ChevronLeft size={18} />
                </Button>
                <span className="text-sm font-bold tabular-nums">
                  {currentSectionIndex + 1}/{sections.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="다음 섹션"
                  disabled={currentSectionIndex === sections.length - 1}
                  onClick={() =>
                    setCurrentSectionIndex((current) => Math.min(sections.length - 1, current + 1))
                  }
                >
                  <ChevronRight size={18} />
                </Button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {[
                { tab: "image" as const, label: "이미지" },
                { tab: "layer" as const, label: "텍스트 편집" },
                { tab: "copy" as const, label: "카피" },
              ].map((item) => (
                <button
                  key={item.tab}
                  type="button"
                  aria-pressed={workbenchTab === item.tab && workbenchState.isOpen}
                  onClick={() => openWorkbench(item.tab)}
                  className={cn(dockButtonClass, workbenchTab === item.tab && workbenchState.isOpen && dockButtonActiveClass)}
                >
                  {item.label}
                </button>
              ))}
              <button type="button" onClick={handleAddShapeLayer} className={dockButtonClass}>
                배경 사각형 추가
              </button>
              <button
                type="button"
                aria-pressed={workbenchTab === "guide" && workbenchState.isOpen}
                onClick={() => openWorkbench("guide")}
                className={cn(dockButtonClass, workbenchTab === "guide" && workbenchState.isOpen && dockButtonActiveClass)}
              >
                가이드
              </button>
            </div>

              {/*
                **작업대를 이미지 옆 칸에 고정한다**(2026-09-23 사용자: 「레이아웃이
                정형화 안 되어 겹치고 안 보인다」).

                전에는 무대 위에 떠 있는 창(`Rnd`)이었다. 처음 자리가 x=756 으로
                박혀 있어 무대가 그보다 좁으면 **오른쪽 끝이 잘려** 닫기 단추가
                안 보였고, 넓으면 이미지 위를 덮었다. 끌어서 옮기는 것은 사용자가
                매번 치워야 한다는 뜻이다. 이제 넓은 화면에서는 오른쪽 칸, 좁은
                화면에서는 이미지 아래에 놓인다 — 어느 폭에서도 겹치지 않는다.
              */}
              <div
                className={cn(
                  "grid items-start gap-4",
                  workbenchState.isOpen && "2xl:grid-cols-[minmax(0,1fr)_clamp(320px,22vw,380px)]",
                )}
              >
              <div className={styles.previewStage} ref={previewStageRef}>
                {currentSection.generatedImage ? (
                  /*
                    **겉은 줄고 안은 고정이다.**

                    안쪽 캔버스는 늘 460px 이고, 좁은 화면에서는 이 겉껍데기가
                    그만큼 줄인 배율(`--canvas-fit`)을 넣어 준다. 레이어 좌표가
                    460 기준으로 고정되므로 **어느 기기에서 열어도 같은 자리**다.

                    전에는 캔버스 자체가 줄어 좌표의 뜻이 화면마다 달랐다 —
                    데스크톱에서 오른쪽에 붙인 글자가 휴대폰에서 잘렸다.
                  */
                  <div
                    className={styles.imageCanvasFit}
                    ref={attachCanvasFit}
                    // 줄인 만큼 자리도 줄인다. 안 그러면 아래에 빈 공간이 남는다.
                    style={canvasHeight ? { height: `${canvasHeight * canvasFit}px` } : undefined}
                  >
                  <div
                    className={styles.imageCanvas}
                    ref={attachCanvas}
                    style={{ "--canvas-fit": canvasFit } as CSSProperties}
                  >
                    <img
                      alt={currentSection.section_name}
                      className={styles.sectionImage}
                      draggable={false}
                      src={currentSection.generatedImage}
                      /*
                        **못 읽으면 그렇다고 말한다.** 손상된 초안을 열면 빈
                        자리 위에 글자만 떠 있었고, 사용자는 무엇이 잘못됐는지
                        모른 채 이미지가 사라졌다고 본다.
                      */
                      onError={() =>
                        setErrorMessage(
                          `${getDisplaySectionName(currentSection)} 이미지를 불러오지 못했습니다. 다시 만들어 주세요.`,
                        )
                      }
                    />

                    {[...currentShapeLayers, ...currentTextLayers].map((layer) => {
                      // 끄는 중이면 임시 자리로 보여 준다. 확정은 놓을 때 한다.
                      const overlay = previewedLayer(layer, layerPreview);
                      return (
                      <Rnd
                        // 겉이 줄어 있으면 마우스 움직임도 그만큼 환산해야
                        // 잡은 자리와 실제 자리가 어긋나지 않는다.
                        scale={canvasFit}
                        bounds="parent"
                        className={`${styles.overlayBox} ${isShapeLayer(overlay) ? styles.shapeLayerBox : styles.textLayerBox} ${selectedOverlayId === overlay.id ? styles.overlaySelected : ""}`}
                        enableUserSelectHack={false}
                        enableResizing={
                          selectedOverlayId === overlay.id
                            ? {
                                top: true,
                                right: true,
                                bottom: true,
                                left: true,
                                topRight: true,
                                bottomRight: true,
                                bottomLeft: true,
                                topLeft: true,
                              }
                            : false
                        }
                        key={overlay.id}
                        onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
                          event.stopPropagation();
                          setSelectedOverlayId(overlay.id);
                        }}
                        onDragStart={() => {
                          setSelectedOverlayId(overlay.id);
                          setActiveColorPalette(null);
                        }}
                        /*
                          **끄는 동안은 임시 자리에만 담는다**(B-12-c).

                          전에는 프레임마다 확정해서, 60fps 드래그가 부모
                          (`PdpMakerClient`)를 초당 60번 다시 그리고 저장
                          시계를 61번 움직였다. 놓기 전의 중간 좌표는 저장할
                          값이 아니다.
                        */
                        onDrag={(_, data) => setLayerPreview({ id: layer.id, x: data.x, y: data.y })}
                        onDragStop={(_, data) => {
                          // **확정은 언제나 `layer`.** 임시 객체를 넘기면 언젠가
                          // 임시값을 확정하게 된다.
                          handleOverlayDrag(layer, data.x, data.y);
                          // 안 비우면 다음 렌더가 임시 자리를 계속 보여 준다.
                          setLayerPreview(null);
                        }}
                        // 크기 조절도 같은 기계다. 놓을 때 한 번 확정한다.
                        onResize={(_, direction, ref, __, position) =>
                          setLayerPreview(previewResize(layer, direction, ref, position))
                        }
                        onResizeStart={() => {
                          handleResizeStart(layer);
                        }}
                        onResizeStop={(_, direction, ref, __, position) => {
                          handleResize(layer, direction, ref, position);
                          handleResizeStop(layer.id);
                          setLayerPreview(null);
                        }}
                        position={{ x: overlay.x, y: overlay.y }}
                        resizeHandleClasses={{
                          top: styles.resizeHandleTop,
                          bottom: styles.resizeHandleBottom,
                          left: styles.resizeHandleLeft,
                          right: styles.resizeHandleRight,
                          topLeft: styles.resizeHandleTopLeft,
                          topRight: styles.resizeHandleTopRight,
                          bottomLeft: styles.resizeHandleBottomLeft,
                          bottomRight: styles.resizeHandleBottomRight,
                        }}
                        style={{
                          zIndex: isShapeLayer(overlay)
                            ? selectedOverlayId === overlay.id
                              ? 2
                              : 1
                            : selectedOverlayId === overlay.id
                              ? 5
                              : 4,
                        }}
                        size={{ width: overlay.width, height: overlay.height }}
                      >
                        {isShapeLayer(overlay) ? (
                          <div className={`${styles.overlayContent} ${styles.overlayDragSurface}`}>
                            <div className={styles.shapeLayerSurface} style={buildShapeLayerStyle(overlay)} />
                          </div>
                        ) : (
                          <div
                            className={`${editingOverlayId === overlay.id ? styles.overlayEditing : styles.overlayContent} ${styles.overlayDragSurface}`}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              setSelectedOverlayId(overlay.id);
                              setEditingOverlayId(overlay.id);
                            }}
                            style={buildOverlayShellStyle(overlay)}
                          >
                            {overlay.backgroundEnabled ? (
                              <div className={styles.overlayBackdrop} style={buildOverlayBackgroundStyle(overlay)} />
                            ) : null}
                            {editingOverlayId === overlay.id ? (
                              <textarea
                                autoFocus
                                className={styles.overlayTextarea}
                                onBlur={() => setEditingOverlayId(null)}
                                onChange={(event) => updateTextOverlayContent(overlay.id, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    setEditingOverlayId(null);
                                  }
                                }}
                                style={buildOverlayTextStyle(overlay)}
                                value={overlay.text}
                              />
                            ) : (
                              <div className={styles.overlayTextLayer} style={buildOverlayTextStyle(overlay)}>
                                {overlay.text}
                              </div>
                            )}
                          </div>
                        )}
                      </Rnd>
                      );
                    })}
                  </div>
                  </div>
                ) : (
                  <div className={styles.placeholderPanel}>
                    <div className={styles.placeholderIcon}>
                      <ImageIcon size={28} />
                    </div>
                    <strong>이 섹션의 이미지를 아직 만들지 않았습니다.</strong>
                    <p>이미지 생성 옵션을 정하고 이미지를 만들면, 캔버스 안에서 바로 텍스트를 얹고 편집할 수 있습니다.</p>
                  </div>
                )}

              </div>

                {workbenchState.isOpen ? (
                  <div className={styles.workbenchDock}>
                    <div className={styles.workbenchPanel} onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}>
                      <div className={styles.workbenchHandle}>
                        <div className={styles.workbenchHandleCopy}>
                          <span className={styles.optionMiniLabel}>Canvas Workbench</span>
                          <strong>
                            {workbenchTab === "image"
                              ? "이미지 옵션"
                              : workbenchTab === "layer"
                                ? "텍스트 편집"
                                : workbenchTab === "copy"
                                  ? "카피 라이브러리"
                                  : "섹션 가이드"}
                          </strong>
                        </div>
                        <div className={styles.workbenchHeaderActions}>
                          <button
                            className={styles.inlineButton}
                            onClick={() =>
                              setWorkbenchState((current) => ({
                                ...current,
                                isOpen: false,
                              }))
                            }
                            type="button"
                          >
                            닫기
                          </button>
                        </div>
                      </div>

                      <div className={styles.workbenchTabs}>
                        <button
                          className={workbenchTab === "image" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("image")}
                          type="button"
                        >
                          이미지
                        </button>
                        <button
                          className={workbenchTab === "layer" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("layer")}
                          type="button"
                        >
                          텍스트 편집
                        </button>
                        <button
                          className={workbenchTab === "copy" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("copy")}
                          type="button"
                        >
                          카피
                        </button>
                        <button
                          className={workbenchTab === "guide" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("guide")}
                          type="button"
                        >
                          가이드
                        </button>
                      </div>

                      <div className={styles.workbenchBody}>{renderWorkbenchBody()}</div>
                    </div>
                  </div>
                ) : null}
              </div>

              {그림낡음 ? (
                <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm">
                  {IMAGE_STALE_NOTICE}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                {/*
                  **고친 글과 다른 이미지를 「준비 완료」라고 하지 않는다**(N-5).

                  글자가 이미지 안에 그려지므로, 제목을 고치면 그림은 옛 글자를
                  들고 있다. 그대로 내보내면 고친 글과 다른 이미지가 나간다.
                */}
                <Badge
                  variant={
                    그림낡음 ? "destructive" : currentSection.generatedImage ? "green" : "outline"
                  }
                >
                  {그림낡음
                    ? "이전 구성의 결과"
                    : currentSection.generatedImage
                      ? "이미지 준비 완료"
                      : "이미지 생성 필요"}
                </Badge>
                {currentSection.qaStatus === "unavailable" ? (
                  /*
                    **검수를 못 돌린 것을 숨기지 않는다.** 그림은 나왔지만
                    아무도 안 봤다 — 「이상 없음」과 구별해 알린다(설계 §10.2).
                  */
                  <Badge variant="outline" title="검수 호출이 실패해 이미지를 확인하지 못했습니다.">
                    검수 못 함
                  </Badge>
                ) : null}
                {currentSection.qaWarnings && currentSection.qaWarnings.length > 0 ? (
                  <Badge
                    variant={currentSection.qaWarnings.some(isBlockingDefect) ? "destructive" : "secondary"}
                    title={currentSection.qaWarnings.map((defect) => defect.evidence).filter(Boolean).join(" · ")}
                  >
                    {currentSection.qaWarnings.some(isBlockingDefect) ? "⚠ 브랜드/왜곡 확인" : "⚠ 오타 의심"}
                  </Badge>
                ) : null}
                <Badge variant="secondary">레이어 {currentLayers.length}개</Badge>
                <Badge variant="secondary">
                  {workbenchState.isOpen ? "워크벤치 열림" : "워크벤치 닫힘"}
                </Badge>
              </div>
            </article>
          </section>
        </div>
      )}
    </div>
  );
}
