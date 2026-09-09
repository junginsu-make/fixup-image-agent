"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Globe2,
  Image as ImageIcon,
  Library,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Type,
  User,
} from "lucide-react";
import { Rnd } from "react-rnd";
import type {
  AspectRatio,
  BlueprintReview,
  GeneratedResult,
  ImageGenOptions,
  PdpCopyLanguage,
  PdpGenerateImageResponse,
  PdpOutputMode,
  ReferenceModelUsage,
  QaDefect,
} from "@fixup/pdp-core";
import { isBlockingDefect } from "@fixup/pdp-core";
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
import {
  chunkForModel,
  planUploadBatches,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  IMAGE_MODEL_CREDIT_WEIGHT,
} from "@fixup/pdp-core";
import type { AttachmentIntents, ImageModelId, PageImageWire } from "@fixup/pdp-core";
import { buildPageWire } from "./page-wire";
import { describeBatchRun } from "./generation-run";
import {
  ALIGN_OPTIONS,
  BASIC_SOLID_COLORS,
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
  anchorWorkbenchToOverlay,
  applyLanguageToTextOverlay,
  buildExportNode,
  buildOverlayBackgroundStyle,
  buildOverlayShellStyle,
  buildOverlayTextStyle,
  buildShapeLayerStyle,
  clampValue,
  clampWorkbenchToStage,
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
  getWorkbenchPosition,
  isShapeLayer,
  isTextLayer,
  normalizeCanvasLayer,
  normalizeImageOptions,
  normalizeOverlayRecord,
  normalizeSectionCopyFields,
  normalizeSectionOptions,
  normalizeShapeLayer,
  normalizeTextOverlay,
  sanitizeSectionFileName,
  sortColorsByContrast,
  toNumericSize,
  uniqueColors,
  DEFAULT_COLOR_RECOMMENDATIONS,
} from "./pdp-canvas-utils";
import type {
  ImageColorRecommendations,
} from "./pdp-canvas-utils";
import { randomId } from "../../lib/browser-safe";

interface PdpEditorProps {
  initialResult: GeneratedResult;
  /** 텍스트 경로의 구성안 심사 결과. 있으면 자기채점 점수표 대신 이것을 보여준다. */
  review?: BlueprintReview;
  /** 이 페이지의 디자인 언어를 정하는 참조 이미지. 모든 섹션이 같은 것을 쓴다. */
  styleReference?: { imageBase64: string; mimeType: string; description?: string };
  /** 제품 이미지를 지킬 것인가. 레퍼런스가 있을 때만 의미가 있다. */
  preserveProduct?: boolean;
  /** 이 페이지에 고정할 인물. 섹션마다 맞는 각도가 자동으로 들어간다. */
  characterId?: string;
  aspectRatio: AspectRatio;
  outputMode?: PdpOutputMode;
  /** 그림의 결. 상세페이지의 기본은 photoreal — 지금까지 늘 사진이었다. */
  look?: ImageLook;
  /** 사용자가 직접 친 지시. 프롬프트 양끝에 놓여 다른 모든 지시보다 앞선다. */
  userInstruction?: string;
  // 단계 표시줄은 4단계를 모두 그리므로 1·2단계 라벨도 계속 보인다.
  // 텍스트로 시작한 작업에 "이미지 업로드"가 뜨지 않게 시작 방식을 넘겨받는다.
  startMode?: CreateMode;
  /** 텍스트 경로에서 고른 이미지 모델. 섹션 생성에 그대로 쓴다. */
  imageModel?: ImageModelId;
  desiredTone: string;
  initialDraftState?: PdpEditorDraftState | null;
  lastSavedAt?: string | null;
  manualSaveToastToken?: number;
  onOpenSettings?: () => void;
  onReset: () => void;
  onDraftStateChange?: (draftState: PdpEditorDraftState) => void;
  onManualSave?: () => void;
  apiConnectionLabel?: string;
  referenceModelImage?: PreparedImageDraft | null;
  referenceModelUsage?: ReferenceModelUsage | null;
  /** 첨부 자리마다 적은 「이 그림을 어떻게 쓸까요」. 안 붙은 자리는 걸러서 온다. */
  attachmentIntents?: AttachmentIntents;
  /** 페이지 전체의 배경 설명(채널·시즌). 1단계의 「그 밖에」다. */
  pageContext?: string;
  saveState?: "idle" | "saving" | "saved" | "error";
}

/** /api/pdp/images/batch 응답. 실패한 섹션은 ok:false 로 개별 표시된다. */
type BatchImagesResponse =
  | {
      ok: true;
      requested: number;
      succeeded: number;
      results: Array<
        | { sectionId: string; ok: true; imageBase64: string; mimeType: string; qa?: { warnings?: QaDefect[] } }
        | { sectionId: string; ok: false; code?: string; message?: string }
      >;
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
  review,
  styleReference,
  preserveProduct = true,
  characterId,
  aspectRatio,
  outputMode,
  look = "photoreal",
  userInstruction = "",
  startMode = "image",
  imageModel = DEFAULT_IMAGE_MODEL,
  desiredTone,
  initialDraftState,
  lastSavedAt,
  manualSaveToastToken = 0,
  onOpenSettings,
  onReset,
  onDraftStateChange,
  onManualSave,
  apiConnectionLabel = "키 필요",
  referenceModelImage = null,
  referenceModelUsage = null,
  attachmentIntents,
  pageContext,
  saveState = "idle",
}: PdpEditorProps) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(() => initialDraftState?.currentSectionIndex ?? 0);
  const [sections, setSections] = useState(() =>
    initialDraftState?.sections?.length
      ? initialDraftState.sections.map((section) => normalizeSectionCopyFields({ ...section }))
      : initialResult.blueprint.sections.map((section) => normalizeSectionCopyFields({ ...section }))
  );
  /* 격자에서 여러 장을 동시에 만들 수 있으므로 '생성 중'을 섹션 키 집합으로 둔다. */
  const [generatingKeys, setGeneratingKeys] = useState<string[]>([]);
  const [generationRun, setGenerationRun] = useState<GenerationRun | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState(
    () =>
      initialDraftState?.notice ??
      (outputMode === "full-image"
        ? "통이미지 모드 — 문구가 이미지에 포함돼 있어요. 확인하고 바로 다운로드하세요."
        : "섹션 컷을 고르고 텍스트를 배치한 뒤 바로 다운로드할 수 있습니다.")
  );
  /* 레이어·설정은 섹션 순서가 아니라 고유 키로 저장한다.
     순서로 저장하면 섹션 순서를 바꿨을 때 다른 섹션의 레이어가 딸려온다. */
  const [sectionKeys, setSectionKeys] = useState<string[]>(
    () =>
      initialDraftState?.sectionKeys?.length === (initialDraftState?.sections?.length ?? -1)
        ? initialDraftState.sectionKeys
        : buildSectionKeys(
            initialDraftState?.sections?.length
              ? initialDraftState.sections
              : initialResult.blueprint.sections
          )
  );
  const [sectionOptions, setSectionOptions] = useState<Record<string, ImageGenOptions>>(
    () =>
      normalizeSectionOptions(
        initialDraftState?.sectionOptions ?? {},
        referenceModelUsage,
        // '첫 섹션'은 순서가 아니라 키로 가린다.
        (initialDraftState?.sectionKeys?.length === (initialDraftState?.sections?.length ?? -1)
          ? initialDraftState.sectionKeys
          : buildSectionKeys(
              initialDraftState?.sections?.length ? initialDraftState.sections : initialResult.blueprint.sections
            ))[0]
      )
  );
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
  const imageContainerRef = useRef<HTMLDivElement>(null);
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
  const selectedLayer = currentLayers.find((overlay) => overlay.id === selectedOverlayId) ?? null;
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
    if (!previewStageRef.current) {
      return;
    }

    setWorkbenchState((current) => clampWorkbenchToStage(current, previewStageRef.current));
  }, [currentSectionIndex, currentSection?.generatedImage]);

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
    const recommendedWidth = clampValue(Math.round(overlay.fontSize * 10), 220, 520);
    const nextWidth = Math.max(currentWidth, recommendedWidth);

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

  const openWorkbench = (tab: WorkbenchTab) => {
    setWorkbenchTab(tab);
    setWorkbenchState((current) => {
      const fallback = getWorkbenchPosition(previewStageRef.current);

      return {
        ...(current.isOpen ? current : fallback),
        isOpen: true,
      };
    });
  };

  const snapWorkbenchToEdge = () => {
    const nextPosition = getWorkbenchPosition(previewStageRef.current);
    setWorkbenchState((current) => ({
      ...current,
      ...nextPosition,
      isOpen: true,
    }));
  };

  const snapWorkbenchToOverlay = () => {
    if (!selectedLayer) {
      return;
    }

    setWorkbenchState((current) => ({
      ...current,
      ...anchorWorkbenchToOverlay(selectedLayer, imageContainerRef.current, previewStageRef.current, current),
      isOpen: true,
    }));
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
              {isGeneratingSection ? <Loader2 className={styles.spinIcon} size={16} /> : currentSection.generatedImage ? <RefreshCw size={16} /> : <ImageIcon size={16} />}
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
                <Trash2 size={14} />
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
                {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    className={selectedTextLayer.textAlign === value ? styles.alignButtonActive : styles.alignButton}
                    key={value}
                    onClick={() => handleTextAlignChange(selectedTextLayer, value)}
                    type="button"
                  >
                    <Icon size={15} />
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
                <Trash2 size={14} />
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
                  <Square size={15} />
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
                <b>통이미지 모드</b> — 문구가 이미 이미지에 들어있어요. 아래 텍스트·도형 도구는{" "}
                <b>추가로 얹고 싶을 때만</b> 쓰세요.
              </div>
            ) : null}
            <div className={styles.copySection}>
              <p className={styles.cardLabel}>Layout Object</p>
              <button className={styles.copyUtilityButton} onClick={handleAddShapeLayer} type="button">
                <Palette size={15} />
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
  const pageWire = (): PageImageWire =>
    buildPageWire({
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
        }),
      });
      delete retryRequestKeysRef.current[sectionKey];

      if (!response.ok) {
        setErrorMessage(response.message);
        const responseCode = String(response.code || "");
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
        current.map((item, itemIndex) =>
          sectionKeys[itemIndex] === sectionKey
            ? { ...item, generatedImage: toDataUrl(response.mimeType, response.imageBase64), qaWarnings: response.qa?.warnings }
            : item
        )
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
    const targets = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => !section.generatedImage);

    if (!targets.length) return;

    generationLockRef.current = true;
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
        const response = await apiJson<BatchImagesResponse>("/pdp/images/batch", {
          method: "POST",
          body: JSON.stringify({
            originalImageBase64: initialResult.originalImage,
            sections: chunk.map(({ section }) => section),
            // 묶음 안 순서가 아니라 **페이지에서의 자리**를 보낸다. 인물 사진을
            // 「첫 섹션에만」 쓸 때 두 번째 묶음의 첫 장은 히어로가 아니다.
            sectionIndexes: chunk.map(({ index }) => index),
            aspectRatio,
            desiredTone: desiredTone || undefined,
            characterId,
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
            // 섹션마다 제목이 다르므로 강조도 섹션별이다.
            emphasisWordsBySection: Object.fromEntries(
              chunk
                .map(({ section, index }) => {
                  const words = keepWordsPresentIn(
                    section.headline ?? "",
                    sectionOptions[sectionKeys[index] ?? String(index)]?.emphasisWords ?? [],
                  );
                  return [section.section_id, words] as const;
                })
                .filter(([, words]) => words.length > 0),
            ),
          }),
        });

        processed += chunk.length;

        if (!response.ok) {
          // 한 묶음이 막히면 다음 묶음도 같은 이유로 막힌다(크레딧 소진 등).
          // 계속 밀어붙이면 같은 오류만 반복하므로 여기서 멈춘다.
          failed += chunk.length;
          setErrorMessage(response.message ?? "일괄 생성에 실패했습니다.");
          break;
        }

        const bySection = new Map(response.results.map((item) => [item.sectionId, item]));
        setSections((current) =>
          current.map((item) => {
            const outcome = bySection.get(item.section_id);
            if (!outcome?.ok) return item;
            return {
              ...item,
              generatedImage: toDataUrl(outcome.mimeType, outcome.imageBase64),
              qaWarnings: outcome.qa?.warnings,
            };
          }),
        );
        completed += response.succeeded;
        failed += response.requested - response.succeeded;

        setGenerationRun(
          describeRun("running", getDisplaySectionName(chunk[chunk.length - 1].section)),
        );
      }
    } catch (error) {
      failed += targets.length - processed;
      processed = targets.length;
      setErrorMessage(
        error instanceof Error ? `${error.message}` : "일괄 생성 응답을 확인하지 못했습니다.",
      );
    } finally {
      setGenerationRun(
        describeRun(
          "finished",
          getDisplaySectionName(targets[Math.max(0, processed - 1)].section),
        ),
      );
      setNotice(
        `일괄 생성 결과: 성공 ${completed}장${failed ? ` · 실패 ${failed}장` : ""}. 성공한 ${completed}장에 대해 ${completed * IMAGE_MODEL_CREDIT_WEIGHT[imageModel]}장이 차감됐습니다.`
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
  const handleDeleteSection = (index: number) => {
    if (sections.length <= 1) {
      setErrorMessage("섹션은 최소 한 개는 있어야 합니다.");
      return;
    }

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
    setCurrentSectionIndex((current) => Math.max(0, Math.min(current, sections.length - 2)));
    setNotice("섹션을 삭제했습니다.");
  };

  /** 빈 섹션을 뒤에 추가한다. 키는 기존과 겹치지 않게 만든다. */
  const handleAddSection = () => {
    const used = new Set(sectionKeys);
    let n = sections.length + 1;
    let key = `S${n}`;
    while (used.has(key)) {
      n += 1;
      key = `S${n}`;
    }

    setSections((current) => [
      ...current,
      // 타입 단언으로 때우지 않고 스키마의 모든 필드를 채운다.
      // 빠뜨리면 편집기 곳곳에서 undefined 를 만난다.
      normalizeSectionCopyFields({
        section_id: key,
        section_name: `새 섹션 ${current.length + 1}`,
        goal: "",
        headline: "",
        headline_en: "",
        subheadline: "",
        subheadline_en: "",
        bullets: [],
        bullets_en: [],
        trust_or_objection_line: "",
        trust_or_objection_line_en: "",
        CTA: "",
        CTA_en: "",
        layout_notes: "",
        compliance_notes: "",
        image_id: key,
        purpose: "",
        prompt_ko: "",
        prompt_en: "",
        negative_prompt: "",
        style_guide: "",
        reference_usage: "",
      }),
    ]);
    setSectionKeys((current) => [...current, key]);
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
      fontFamily: "'Pretendard', sans-serif",
      lineHeight: 1.2,
      maxWidth: style.maxWidth,
    });

    const newOverlay: TextOverlay = {
      id: randomId(),
      kind: "text",
      text: displayText,
      language: defaultCopyLanguage,
      translations: normalizedTranslations,
      x: 52,
      y: 52,
      width: estimatedBox.width,
      height: estimatedBox.height,
      fontSize: defaultFontSize,
      color: "#ffffff",
      backgroundColor: shapeColorRecommendations[0] ?? "#102532",
      backgroundEnabled: false,
      backgroundOpacity: 0.72,
      backgroundRadius: 18,
      fontFamily: "'Pretendard', sans-serif",
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
      x: 64,
      y: 64,
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

  const handleResize = (
    overlay: CanvasLayer,
    direction: string,
    ref: HTMLElement,
    position: { x: number; y: number }
  ) => {
    const base = resizeSessionRef.current[overlay.id] ?? {
      width: toNumericSize(overlay.width, 320),
      height: toNumericSize(overlay.height, 92),
      fontSize: isTextLayer(overlay) ? overlay.fontSize : 0,
    };

    const nextWidth = ref.offsetWidth;
    const nextHeight = ref.offsetHeight;
    const isHorizontalOnly = direction === "left" || direction === "right";
    const isVerticalOnly = direction === "top" || direction === "bottom";

    if (isHorizontalOnly) {
      updateOverlay(overlay.id, { width: nextWidth, x: position.x });
      return;
    }

    if (isVerticalOnly) {
      updateOverlay(overlay.id, { height: nextHeight, y: position.y });
      return;
    }

    if (isShapeLayer(overlay)) {
      updateOverlay(overlay.id, { width: nextWidth, height: nextHeight, x: position.x, y: position.y });
      return;
    }

    const scale = Math.max(nextWidth / Math.max(base.width, 1), nextHeight / Math.max(base.height, 1));
    const nextFontSize = clampValue(Math.round(base.fontSize * scale), 10, 180);

    updateOverlay(overlay.id, {
      width: nextWidth,
      height: nextHeight,
      x: position.x,
      y: position.y,
      fontSize: nextFontSize,
    });
  };

  const handleResizeStop = (overlayId: string) => {
    delete resizeSessionRef.current[overlayId];
  };

  const handleOverlayDrag = (overlay: CanvasLayer, x: number, y: number) => {
    updateOverlay(overlay.id, { x, y });
  };

  const captureSectionBlob = async (sectionIndex: number) => {
    const section = sections[sectionIndex];
    if (!section?.generatedImage) {
      throw new Error("이미지가 없는 섹션은 다운로드할 수 없습니다.");
    }

    const width = imageContainerRef.current?.clientWidth ?? 460;
    const layers = overlaysBySection[sectionKeys[sectionIndex] ?? String(sectionIndex)] ?? [];
    const exportNode = await buildExportNode({ imageSrc: section.generatedImage, width, layers });

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
        scale: 2,
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });

      if (!blob) {
        throw new Error("다운로드용 이미지를 만들지 못했습니다.");
      }

      return blob;
    } finally {
      exportNode.remove();
    }
  };

  const handleDownload = async () => {
    if (!currentSection.generatedImage) {
      return;
    }

    try {
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
      setActiveColorPalette(null);
      const blob = await captureSectionBlob(currentSectionIndex);
      downloadBlob(blob, `pdp-${sanitizeSectionFileName(currentSection.section_id)}.jpg`);
      setNotice(`${getDisplaySectionName(currentSection)} 컷을 다운로드했습니다.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이미지를 다운로드하지 못했습니다.");
    }
  };

  /**
   * 만든 섹션을 계정 라이브러리에 올린다.
   *
   * 자동으로 올리지 않는다 — 실험 삼아 돌린 것까지 쌓이면 목록이 쓰레기로 찬다.
   * 브라우저 초안 저장("작업 저장하기")과는 다른 동작이다. 이쪽은 서버에 남아
   * 다른 기기에서도 보이고, 브라우저를 지워도 사라지지 않는다.
   */
  const handleSaveToLibrary = async () => {
    const saved = sections.filter((section) => Boolean(section.generatedImage));
    if (!saved.length) {
      setErrorMessage("라이브러리에 저장할 이미지가 아직 없습니다.");
      return;
    }

    setIsSavingToLibrary(true);
    setErrorMessage("");
    try {
      const images = saved.map((section) => {
        const [, mimeType = "image/png", base64 = ""] =
          /^data:([^;]+);base64,(.*)$/.exec(section.generatedImage ?? "") ?? [];
        return { base64, mimeType };
      });

      // 섹션 이미지 한 장이 4~5MB다. 전부 한 요청에 담으면 서버가 파싱하다
      // 죽을 수 있다(운영 여유 메모리 445MB). 예산에 맞춰 나눠 보낸다.
      const batches = planUploadBatches(images);
      let savedCount = 0;
      let failure = "";

      for (const [index, batch] of batches.entries()) {
        const title =
          (initialResult.blueprint.executiveSummary?.slice(0, 60) || "상세페이지 작업") +
          (batches.length > 1 ? ` (${index + 1}/${batches.length})` : "");
        const response = await apiJson<{ ok: boolean; imageCount?: number; message?: string }>(
          "/library",
          {
            method: "POST",
            body: JSON.stringify({ title, tool: "create", aspectRatio, images: batch }),
          },
        );
        if (response.ok) savedCount += response.imageCount ?? batch.length;
        else {
          failure = response.message ?? "라이브러리에 저장하지 못했습니다.";
          break;
        }
      }

      if (savedCount) {
        setNotice(`라이브러리에 ${savedCount}장을 저장했습니다. 다른 기기에서도 보입니다.`);
      }
      if (failure) setErrorMessage(failure);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "라이브러리에 저장하지 못했습니다.",
      );
    } finally {
      setIsSavingToLibrary(false);
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
        const blob = await captureSectionBlob(index);
        zip.file(`pdp-${String(index + 1).padStart(2, "0")}-${sanitizeSectionFileName(section.section_id)}.jpg`, blob);
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
          <Badge variant={apiConnectionLabel === "연결됨" ? "green" : "destructive"}>
            API {apiConnectionLabel}
          </Badge>
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
        <StepBar steps={CREATE_STEPS[startMode]} current={screen === "gallery" ? "sections" : "edit"} />
      </div>

      <div
        className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg bg-card p-2 shadow-[var(--shadow-ring)]"
        onClick={stopShellClick}
      >
        <Button variant="ghost" size="sm" disabled={isGenerating} onClick={onReset}>
          <ChevronLeft size={16} className="mr-1" />
          설정으로
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <div className="flex gap-0.5 rounded-full bg-background p-0.5 shadow-[var(--shadow-ring)]">
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
                "rounded-full px-3 py-1 text-xs font-bold transition-colors",
                screen === item.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="mx-1 h-5 w-px bg-border" />
        {onOpenSettings ? (
          <Button variant="ghost" size="sm" onClick={onOpenSettings}>
            <Settings2 size={16} className="mr-1.5" />
            설정
          </Button>
        ) : null}
        {onManualSave ? (
          <Button variant="ghost" size="sm" disabled={saveState === "saving"} onClick={onManualSave}>
            {saveState === "saving" ? (
              <Loader2 size={16} className="mr-1.5 animate-spin" />
            ) : (
              <Save size={16} className="mr-1.5" />
            )}
            작업 저장하기
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={!generatedCount || isSavingToLibrary}
          onClick={() => void handleSaveToLibrary()}
          title="계정에 올려 다른 기기에서도 볼 수 있게 합니다"
        >
          {isSavingToLibrary ? (
            <Loader2 size={16} className="mr-1.5 animate-spin" />
          ) : (
            <Library size={16} className="mr-1.5" />
          )}
          라이브러리에 저장
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
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={!generatedCount || isDownloadingAll}
            onClick={handleDownloadAll}
          >
            {isDownloadingAll ? (
              <Loader2 size={16} className="mr-1.5 animate-spin" />
            ) : (
              <Download size={16} className="mr-1.5" />
            )}
            전체 ZIP
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={!currentSection.generatedImage}>
            <Download size={16} className="mr-1.5" />
            현재 섹션 다운로드
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
              성공 {generationRun.completed}장 · 실패 {generationRun.failed}장{generationRun.skipped ? ` · 미시도 ${generationRun.skipped}장` : ""} · 성공한 이미지만 장당 {IMAGE_MODEL_CREDIT_WEIGHT[imageModel]}장씩 차감됩니다.
            </p>
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
            generatingKeys={generatingKeys}
            layerCounts={layerCounts}
            onGenerate={(index) => void handleGenerateImage(index)}
            onGenerateAllMissing={() => void handleGenerateAllMissing()}
            onEdit={(index) => {
              setCurrentSectionIndex(index);
              setScreen("editor");
            }}
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
        <aside className="grid gap-3 xl:sticky xl:top-6" onClick={stopShellClick}>
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
            <div className="grid gap-1">
              {sections.map((section, index) => {
                const isCurrent = index === currentSectionIndex;

                return (
                  <button
                    key={section.section_id}
                    type="button"
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => setCurrentSectionIndex(index)}
                    className={cn(
                      "flex items-start gap-2 rounded-md p-2 text-left transition-colors",
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
              <Sparkles size={16} className="text-primary" />
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
                  <ReviewPanel review={review} />
                </div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {initialResult.blueprint.scorecard.map((item) => (
                    <article
                      key={`${item.category}-${item.score}`}
                      className="rounded-md bg-background p-2.5 shadow-[var(--shadow-ring)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm">{item.category}</strong>
                        <Badge
                          variant={
                            item.score.startsWith("A")
                              ? "green"
                              : item.score.startsWith("B")
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {item.score}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                    </article>
                  ))}
                </div>
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
                { tab: "image" as const, icon: <Settings2 size={15} />, label: "이미지" },
                { tab: "layer" as const, icon: <Type size={15} />, label: "텍스트 편집" },
                { tab: "copy" as const, icon: <Sparkles size={15} />, label: "카피" },
              ].map((item) => (
                <button
                  key={item.tab}
                  type="button"
                  aria-pressed={workbenchTab === item.tab && workbenchState.isOpen}
                  onClick={() => openWorkbench(item.tab)}
                  className={cn(dockButtonClass, workbenchTab === item.tab && workbenchState.isOpen && dockButtonActiveClass)}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
              <button type="button" onClick={handleAddShapeLayer} className={dockButtonClass}>
                <Square size={15} />
                배경 사각형 추가
              </button>
              <button
                type="button"
                aria-pressed={workbenchTab === "guide" && workbenchState.isOpen}
                onClick={() => openWorkbench("guide")}
                className={cn(dockButtonClass, workbenchTab === "guide" && workbenchState.isOpen && dockButtonActiveClass)}
              >
                <Palette size={15} />
                가이드
              </button>
            </div>

              <div className={styles.previewStage} ref={previewStageRef}>
                {currentSection.generatedImage ? (
                  <div className={styles.imageCanvas} ref={imageContainerRef}>
                    <img
                      alt={currentSection.section_name}
                      className={styles.sectionImage}
                      draggable={false}
                      src={currentSection.generatedImage}
                    />

                    {[...currentShapeLayers, ...currentTextLayers].map((overlay) => (
                      <Rnd
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
                        onDrag={(_, data) => handleOverlayDrag(overlay, data.x, data.y)}
                        onDragStop={(_, data) => handleOverlayDrag(overlay, data.x, data.y)}
                        onResize={(_, direction, ref, __, position) => handleResize(overlay, direction, ref, position)}
                        onResizeStart={() => {
                          handleResizeStart(overlay);
                        }}
                        onResizeStop={(_, direction, ref, __, position) => {
                          handleResize(overlay, direction, ref, position);
                          handleResizeStop(overlay.id);
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
                    ))}
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

                {workbenchState.isOpen ? (
                  <Rnd
                    bounds="parent"
                    className={styles.workbenchShell}
                    dragHandleClassName={styles.workbenchHandle}
                    enableResizing={{
                      top: false,
                      right: true,
                      bottom: true,
                      left: false,
                      topRight: false,
                      bottomRight: true,
                      bottomLeft: false,
                      topLeft: false,
                    }}
                    minHeight={420}
                    minWidth={320}
                    onDragStop={(_, data) =>
                      setWorkbenchState((current) => ({
                        ...current,
                        x: data.x,
                        y: data.y,
                      }))
                    }
                    onResizeStop={(_, __, ref, ___, position) =>
                      setWorkbenchState((current) => ({
                        ...current,
                        x: position.x,
                        y: position.y,
                        width: ref.offsetWidth,
                        height: ref.offsetHeight,
                      }))
                    }
                    position={{ x: workbenchState.x, y: workbenchState.y }}
                    size={{ width: workbenchState.width, height: workbenchState.height }}
                  >
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
                            onClick={workbenchTab === "layer" && selectedLayer ? snapWorkbenchToOverlay : snapWorkbenchToEdge}
                            type="button"
                          >
                            <RefreshCw size={14} />
                            옆으로 붙이기
                          </button>
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
                          <Settings2 size={15} />
                          이미지
                        </button>
                        <button
                          className={workbenchTab === "layer" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("layer")}
                          type="button"
                        >
                          <Type size={15} />
                          텍스트 편집
                        </button>
                        <button
                          className={workbenchTab === "copy" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("copy")}
                          type="button"
                        >
                          <Sparkles size={15} />
                          카피
                        </button>
                        <button
                          className={workbenchTab === "guide" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("guide")}
                          type="button"
                        >
                          <Palette size={15} />
                          가이드
                        </button>
                      </div>

                      <div className={styles.workbenchBody}>{renderWorkbenchBody()}</div>
                    </div>
                  </Rnd>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                <Badge variant={currentSection.generatedImage ? "green" : "outline"}>
                  {currentSection.generatedImage ? "이미지 준비 완료" : "이미지 생성 필요"}
                </Badge>
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
