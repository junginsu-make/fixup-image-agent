"use client";

import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Clock3, Copy, FolderOpen, Loader2, RectangleHorizontal, RectangleVertical, RotateCcw, Smartphone, Sparkles, Square, Trash2, Upload, Wand2 } from "lucide-react";
import type { AspectRatio, BlueprintReview, GeneratedResult, ImageModelId, LandingPageBlueprint, PdpAnalyzeResponse, PdpOutputMode, ReferenceModelUsage } from "@fixup/pdp-core";
import { DEFAULT_IMAGE_MODEL } from "@fixup/pdp-core";
import type { PdpAppState, PdpDraftSummary, PdpEditorDraftState, PreparedImageDraft } from "./pdp-drafts";
import { buildSectionKeys, deleteAllPdpDrafts, deletePdpDraft, getPdpDraft, listPdpDrafts, purgeExpiredPdpDrafts, savePdpDraft } from "./pdp-drafts";
import { DRAFT_RETENTION_NOTICE } from "./draft-retention";
import type { CopyIntensity, GapPolicy, SellerBrief } from "@fixup/pdp-core";
import { COPY_INTENSITIES, GAP_POLICIES, GAP_POLICY_LEGEND } from "./copy-controls";
import { Badge, Button, StepBar, cn } from "@fixup/ui";
import { PdpEditor } from "./PdpEditor";
import { CREATE_STEPS, type CreateMode } from "./create-steps";
import { TextModeFlow, type TextStage } from "./TextModeFlow";
import { SavedImagePicker } from "./SavedImagePicker";
import { StyleReferenceAttach } from "./StyleReferenceAttach";
import { ScenarioEditor } from "./ScenarioEditor";
import { CharacterPicker } from "./CharacterPicker";
import type { StyleReferenceView } from "./StyleReferenceCard";
import { RATIO_OPTIONS, TONE_OPTIONS, apiJson, prepareImageFile } from "./pdp-utils";
import { ElapsedTime } from "../_components/elapsed-time";

type PreparedImage = PreparedImageDraft;

const START_MODES: Array<{ value: CreateMode; label: string; desc: string }> = [
  { value: "image", label: "이미지로 시작", desc: "상품 사진이 있습니다. 사진을 분석해 구성을 잡습니다." },
  { value: "text", label: "텍스트로 시작", desc: "사진이 없습니다. 설명을 적으면 구성과 이미지를 만듭니다." },
];

export function PdpMakerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 라이브러리에서 ?draft=<id> 로 넘어오면 그 작업을 한 번만 자동으로 연다.
  const autoloadedDraftRef = useRef(false);
  const [appState, setAppState] = useState<PdpAppState>("upload");
  // 시작 방식. 기본은 기존 이미지 흐름이라 이 화면을 쓰던 사람에게 달라지는 게 없다.
  const [startMode, setStartMode] = useState<CreateMode>("image");
  // 텍스트 경로의 중간 단계. 초안에 저장하지 않으므로 컴포넌트 상태로만 둔다.
  const [textStage, setTextStage] = useState<TextStage>("input");
  // 텍스트 경로에서 고른 이미지 모델. 편집기의 섹션 생성까지 이어진다.
  const [imageModel, setImageModel] = useState<ImageModelId>(DEFAULT_IMAGE_MODEL);
  // 텍스트 경로의 구성안 심사 결과. 이미지 경로에는 심사가 없어 비어 있다.
  const [review, setReview] = useState<BlueprintReview | undefined>(undefined);
  // 확정된 디자인 레퍼런스. 이 페이지의 모든 섹션 생성에 같은 것이 실린다.
  const [styleReference, setStyleReference] = useState<StyleReferenceView | undefined>(undefined);
  // 붙인 레퍼런스를 이번 생성에 쓸지. 껐다 켜기를 반복해도 첨부는 남는다.
  const [styleReferenceEnabled, setStyleReferenceEnabled] = useState(true);
  const [sellerBrief, setSellerBrief] = useState<SellerBrief>({});
  const [copyIntensity, setCopyIntensity] = useState<CopyIntensity>("normal");
  const [gapPolicy, setGapPolicy] = useState<GapPolicy>("ask");
  const [preserveProduct, setPreserveProduct] = useState(true);
  const [characterId, setCharacterId] = useState<string | undefined>(undefined);
  const [preparedImage, setPreparedImage] = useState<PreparedImage | null>(null);
  const [modelImage, setModelImage] = useState<PreparedImage | null>(null);
  const [modelImageUsage, setModelImageUsage] = useState<ReferenceModelUsage | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [desiredTone, setDesiredTone] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  // 기본 출력 = 통이미지(full-image): AI가 한글 카피까지 박은 완성형 섹션을 생성.
  // (사용자 토글 UI는 후속 phase. editable은 엔진 폴백으로 유지.)
  const [outputMode] = useState<PdpOutputMode>("full-image");
  const [notice, setNotice] = useState("브라우저에 초안이 저장되며, 저장한 작업은 이 화면에서 이어서 열 수 있습니다.");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [loadingStep, setLoadingStep] = useState("제품 이미지를 분석하는 중입니다.");
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<PdpDraftSummary[]>([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftCreatedAt, setDraftCreatedAt] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [editorDraftState, setEditorDraftState] = useState<PdpEditorDraftState | null>(null);
  const [editorSessionKey, setEditorSessionKey] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [manualSaveToastToken, setManualSaveToastToken] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  /* AI 공급자 키는 운영자 서버 환경변수로만 관리한다. */
  const [serverKeyConfigured, setServerKeyConfigured] = useState(false);
  const isApplyingDraftRef = useRef(false);
  const saveInFlightRef = useRef(false);

  const selectedRatio = useMemo(() => RATIO_OPTIONS.find((option) => option.value === aspectRatio) ?? RATIO_OPTIONS[2], [aspectRatio]);
  const selectedToneLabel = desiredTone || "AI 자동 추천";
  const preparedImageDisplayName = preparedImage ? formatCompactFileName(preparedImage.fileName) : "";
  const modelImageDisplayName = modelImage ? formatCompactFileName(modelImage.fileName) : "";
  const hasDraftContent = Boolean(preparedImage || modelImage || result || additionalInfo.trim() || desiredTone.trim() || activeDraftId);
  const hasAvailableGeminiKey = serverKeyConfigured;
  const canAnalyze = Boolean(preparedImage && (!modelImage || modelImageUsage) && hasAvailableGeminiKey);
  const apiConnectionLabel = serverKeyConfigured ? "회원 서버 키" : "서버 설정 필요";

  const goToSettings = useCallback(() => router.push("/settings"), [router]);

  const refreshDrafts = useCallback(async () => {
    setIsLoadingDrafts(true);
    try {
      // 목록을 읽을 때 만료된 것을 함께 치운다. 따로 도는 청소 작업을 두면
      // 언제 도는지 알 수 없고, 브라우저를 안 열면 영영 안 돈다.
      await purgeExpiredPdpDrafts();
      setDrafts(await listPdpDrafts());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저장된 작업 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoadingDrafts(false);
    }
  }, []);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  // 서버 키 유무는 한 번만 물어본다(값이 아니라 유무만 온다).
  useEffect(() => {
    let alive = true;
    apiJson<{ serverKeyConfigured?: boolean }>("/pdp/config")
      .then((config) => {
        if (alive) {
          setServerKeyConfigured(Boolean(config?.serverKeyConfigured));
        }
      })
      .catch(() => {
        // 서버 설정 조회 실패는 생성 시작 전에 사용자에게 안내한다.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (isApplyingDraftRef.current || !hasDraftContent) {
      return;
    }

    setIsDirty(true);
    setSaveState((current) => (current === "saved" ? "idle" : current));
  }, [additionalInfo, appState, aspectRatio, desiredTone, editorDraftState, hasDraftContent, modelImage, modelImageUsage, preparedImage, result]);

  const handlePreparedImage = async (file: File) => {
    try {
      if (!file.type.startsWith("image/")) {
        setErrorMessage("이미지 파일만 업로드할 수 있습니다.");
        return;
      }

      const nextImage = await prepareImageFile(file);
      setPreparedImage(nextImage);
      setErrorMessage("");
      setErrorDetail("");
      setShowErrorDetail(false);
      setNotice(`${file.name} 이미지를 준비했습니다. 설정을 확인한 뒤 AI 분석을 시작해 보세요.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이미지를 준비하지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
  };

  const handleModelImage = async (file: File) => {
    try {
      if (!file.type.startsWith("image/")) {
        setErrorMessage("이미지 파일만 업로드할 수 있습니다.");
        return;
      }

      const nextImage = await prepareImageFile(file);
      setModelImage(nextImage);
      setModelImageUsage(null);
      setErrorMessage("");
      setErrorDetail("");
      setShowErrorDetail(false);
      setNotice(`${file.name} 모델 이미지를 준비했습니다. 히어로우 전용 또는 전체 일관성 유지 방식을 선택해 주세요.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "모델 이미지를 준비하지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
  };

  const buildDraftInput = useCallback(() => {
    if (!hasDraftContent) {
      return null;
    }

    return {
      id: activeDraftId ?? undefined,
      createdAt: draftCreatedAt ?? undefined,
      appState: result ? "editor" : appState === "processing" ? "upload" : appState,
      preparedImage,
      modelImage,
      modelImageUsage,
      result,
      additionalInfo,
      sellerBrief,
      copyIntensity,
      gapPolicy,
      desiredTone,
      aspectRatio,
      notice: editorDraftState?.notice ?? notice,
      editorState: result ? editorDraftState ?? createDefaultEditorDraftState(result, outputMode) : null
    };
  }, [activeDraftId, additionalInfo, sellerBrief, copyIntensity, gapPolicy, appState, aspectRatio, desiredTone, draftCreatedAt, editorDraftState, hasDraftContent, modelImage, modelImageUsage, notice, outputMode, preparedImage, result]);

  const persistDraft = useCallback(
    async (mode: "manual" | "auto" | "switch" = "manual", options?: { showToast?: boolean }) => {
      const input = buildDraftInput();
      if (!input || saveInFlightRef.current) {
        return null;
      }

      saveInFlightRef.current = true;
      setSaveState("saving");

      try {
        const savedDraft = await savePdpDraft(input);
        isApplyingDraftRef.current = true;
        setActiveDraftId(savedDraft.id);
        setDraftCreatedAt(savedDraft.createdAt);
        setLastSavedAt(savedDraft.updatedAt);
        setSaveState("saved");
        setIsDirty(false);
        if (mode === "manual") {
          setNotice("현재 작업을 저장했습니다. 시작 화면에서 이어서 작업할 수 있습니다.");
          if (options?.showToast) {
            setManualSaveToastToken(Date.now());
          }
        }
        await refreshDrafts();
        return savedDraft;
      } catch (error) {
        setSaveState("error");
        setErrorMessage("작업을 저장하지 못했습니다.");
        setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        return null;
      } finally {
        saveInFlightRef.current = false;
        requestAnimationFrame(() => {
          isApplyingDraftRef.current = false;
        });
      }
    },
    [buildDraftInput, refreshDrafts]
  );

  const confirmSaveBeforeLeaving = useCallback(async () => {
    if (!isDirty || !hasDraftContent) {
      return true;
    }

    const shouldSave = window.confirm("저장되지 않은 작업이 있습니다.\n확인: 저장 후 이동\n취소: 저장하지 않고 이동");
    if (!shouldSave) {
      return true;
    }

    const savedDraft = await persistDraft("manual");
    return Boolean(savedDraft);
  }, [hasDraftContent, isDirty, persistDraft]);

  const resetWorkspace = useCallback(() => {
    isApplyingDraftRef.current = true;
    setAppState("upload");
    setPreparedImage(null);
    setModelImage(null);
    setModelImageUsage(null);
    setResult(null);
    setAdditionalInfo("");
    setSellerBrief({});
    setCopyIntensity("normal");
    setGapPolicy("ask");
    setDesiredTone("");
    setAspectRatio("9:16");
    setNotice("새 이미지로 다시 시작할 수 있습니다.");
    setErrorMessage("");
    setErrorDetail("");
    setShowErrorDetail(false);
    setAnalysisStartedAt(null);
    setEditorDraftState(null);
    setActiveDraftId(null);
    setDraftCreatedAt(null);
    setLastSavedAt(null);
    setSaveState("idle");
    setIsDirty(false);
    setEditorSessionKey((current) => current + 1);
    requestAnimationFrame(() => {
      isApplyingDraftRef.current = false;
    });
  }, []);

  const handleLoadDraft = useCallback(
    async (draftId: string) => {
      const canContinue = await confirmSaveBeforeLeaving();
      if (!canContinue) {
        return;
      }

      setIsLoadingDraft(true);
      setErrorMessage("");
      setErrorDetail("");
      setShowErrorDetail(false);

      try {
        const draft = await getPdpDraft(draftId);
        if (!draft) {
          setErrorMessage("저장된 작업을 찾지 못했습니다.");
          await refreshDrafts();
          return;
        }

        isApplyingDraftRef.current = true;
        setActiveDraftId(draft.id);
        setDraftCreatedAt(draft.createdAt);
        setLastSavedAt(draft.updatedAt);
        setPreparedImage(draft.preparedImage);
        setModelImage(draft.modelImage ?? null);
        setModelImageUsage(draft.modelImageUsage ?? null);
        setResult(draft.result);
        setAdditionalInfo(draft.additionalInfo);
        setSellerBrief(draft.sellerBrief ?? {});
        setCopyIntensity(draft.copyIntensity ?? "normal");
        setGapPolicy(draft.gapPolicy ?? "ask");
        setDesiredTone(draft.desiredTone);
        setAspectRatio(draft.aspectRatio);
        setNotice(draft.notice);
        setEditorDraftState(draft.editorState);
        setAppState(draft.result ? "editor" : "upload");
        setSaveState("saved");
        setIsDirty(false);
        setEditorSessionKey((current) => current + 1);
      } catch (error) {
        setErrorMessage("저장된 작업을 불러오지 못했습니다.");
        setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      } finally {
        requestAnimationFrame(() => {
          isApplyingDraftRef.current = false;
          setIsLoadingDraft(false);
        });
      }
    },
    [confirmSaveBeforeLeaving, refreshDrafts]
  );

  // 라이브러리에서 '이어서 편집'으로 넘어오면 ?draft=<id> 를 읽어 그 작업을 연다.
  // ref 로 한 번만 실행한다. 안 그러면 로드 중 상태 변경이 재실행을 부를 수 있다.
  useEffect(() => {
    const draftId = searchParams.get("draft");
    if (!draftId || autoloadedDraftRef.current) {
      return;
    }
    autoloadedDraftRef.current = true;
    void handleLoadDraft(draftId);
  }, [searchParams, handleLoadDraft]);

  /**
   * 저장된 작업을 모두 지운다.
   *
   * 되돌릴 수 없으므로 **개수를 밝혀** 확인을 받는다. "정말요?"만 물으면 몇 개가
   * 사라지는지 모른 채 누르게 된다. 지금 열어 둔 작업도 함께 지워지므로 화면을 비운다.
   */
  const handleDeleteAllDrafts = useCallback(async () => {
    const shouldDelete = window.confirm(
      `저장된 작업 ${drafts.length}개를 모두 삭제할까요?
되돌릴 수 없습니다.`,
    );
    if (!shouldDelete) {
      return;
    }

    try {
      await deleteAllPdpDrafts();
      resetWorkspace();
      await refreshDrafts();
      setNotice("저장된 작업을 모두 삭제했습니다.");
    } catch (error) {
      setErrorMessage("저장된 작업을 삭제하지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
  }, [drafts.length, refreshDrafts, resetWorkspace]);

  const handleDeleteDraft = useCallback(
    async (draftId: string) => {
      const shouldDelete = window.confirm("이 저장된 작업을 삭제할까요?");
      if (!shouldDelete) {
        return;
      }

      try {
        await deletePdpDraft(draftId);
        if (activeDraftId === draftId) {
          resetWorkspace();
        }
        await refreshDrafts();
      } catch (error) {
        setErrorMessage("저장된 작업을 삭제하지 못했습니다.");
        setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      }
    },
    [activeDraftId, refreshDrafts, resetWorkspace]
  );

  useEffect(() => {
    if (!isDirty || !hasDraftContent) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDraftContent, isDirty]);

  useEffect(() => {
    if (!hasDraftContent) {
      return;
    }

    const timer = window.setInterval(() => {
      if (!isDirty) {
        return;
      }

      void persistDraft("auto");
    }, 30000);

    return () => window.clearInterval(timer);
  }, [hasDraftContent, isDirty, persistDraft]);

  const handleAnalyze = async () => {
    if (!preparedImage) {
      setErrorMessage("먼저 제품 이미지를 업로드해 주세요.");
      return;
    }

    if (!hasAvailableGeminiKey) {
      setErrorMessage("운영자 Gemini 서버 키가 설정되지 않았습니다. 관리자에게 문의해 주세요.");
      return;
    }

    if (modelImage && !modelImageUsage) {
      setErrorMessage("모델 이미지를 사용할 방식을 먼저 선택해 주세요.");
      return;
    }

    setAppState("processing");
    setErrorMessage("");
    setErrorDetail("");
    setShowErrorDetail(false);
    setLoadingStep("회원 권한과 서버 연결 상태를 확인하는 중입니다.");
    setAnalysisStartedAt(Date.now());

    try {
      setLoadingStep("제품을 분석하고 상세페이지 구조를 설계하는 중입니다.");

      const response = await apiJson<PdpAnalyzeResponse>("/pdp/analyze", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: preparedImage.base64,
          mimeType: preparedImage.mimeType,
          modelImageBase64: modelImage?.base64,
          modelImageMimeType: modelImage?.mimeType,
          modelImageFileName: modelImage?.fileName,
          additionalInfo: additionalInfo.trim() || undefined,
          sellerBrief,
          copyIntensity,
          gapPolicy,
          desiredTone: desiredTone.trim() || undefined,
          aspectRatio,
          outputMode
        })
      });

      if (!response.ok) {
        setAppState("upload");
        setErrorMessage(response.message);
        setErrorDetail(response.detail ?? "");
        return;
      }

      setResult(response.result);
      // 심사 결과를 시나리오 화면에 넘긴다. 사진 경로에도 심사가 붙었는데
      // 받아 두지 않으면 화면은 늘 비어 있다.
      setReview(response.result.review);
      setEditorDraftState(null);
      setEditorSessionKey((current) => current + 1);
      // 바로 편집기로 보내면 구성안을 볼 기회가 없다. 이미지는 한 장에 돈이 드니
      // 만들기 전에 카피·장면·레퍼런스를 확인할 수 있어야 한다.
      setNotice("구성안이 나왔습니다. 문구와 장면을 확인하고 필요하면 고쳐 주세요.");
      setAppState("scenario");
    } catch (error) {
      setAppState("upload");
      setErrorMessage("API 서버와 통신하지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
  };

  /**
   * 텍스트 경로가 끝나면 이미지 경로와 똑같은 GeneratedResult 가 들어온다.
   * originalImage 자리에는 승인된 대표 이미지가 들어가고, 이후 단계는 완전히 같다.
   */
  const handleTextModeComplete = (
    generated: GeneratedResult,
    model: ImageModelId,
    blueprintReview?: BlueprintReview,
    chosenStyleReference?: StyleReferenceView,
    chosenPreserveProduct?: boolean,
    chosenCharacterId?: string,
  ) => {
    setImageModel(model);
    setReview(blueprintReview);
    setStyleReference(chosenStyleReference);
    setPreserveProduct(chosenPreserveProduct ?? true);
    setCharacterId(chosenCharacterId);
    setResult(generated);
    setEditorDraftState(null);
    setEditorSessionKey((current) => current + 1);
    setNotice("시나리오와 대표 이미지를 정했습니다. 이제 섹션별 이미지를 만들어 보세요.");
    setAppState("editor");
  };

  const handleReset = async () => {
    const canContinue = await confirmSaveBeforeLeaving();
    if (!canContinue) {
      return;
    }

    resetWorkspace();
  };

  const handleGoToMain = async () => {
    const canContinue = await confirmSaveBeforeLeaving();
    if (!canContinue) {
      return;
    }

    resetWorkspace();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * 사진 경로의 구성안 확인 단계.
   *
   * 글기반 경로가 쓰는 ScenarioEditor 를 그대로 쓴다. 여기서 카피·장면을 고치고,
   * 디자인 레퍼런스를 붙이고, 올린 인물 이미지를 뺄 수 있다 — 앞 화면은 이미 지났다.
   */
  if (appState === "scenario" && result) {
    return (
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6">
        {notice ? (
          <p className="rounded-md bg-primary-soft p-3.5 text-sm text-foreground">{notice}</p>
        ) : null}
        <ScenarioEditor
          blueprint={result.blueprint}
          referenceModelName={modelImage ? modelImageDisplayName : undefined}
          onReferenceModelRemove={() => {
            setModelImage(null);
            setModelImageUsage(null);
            setNotice("인물 이미지를 뺐습니다. 이후 생성에는 반영되지 않습니다.");
          }}
          review={review}
          styleReference={styleReference}
          styleReferenceEnabled={styleReferenceEnabled}
          onStyleReferenceToggle={setStyleReferenceEnabled}
          onStyleReferenceAttached={setStyleReference}
          preserveProduct={preserveProduct}
          onPreserveProductChange={setPreserveProduct}
          characterId={characterId}
          onCharacterChange={setCharacterId}
          outputMode={outputMode}
          imageModel={imageModel}
          isBusy={false}
          onChange={(blueprint: LandingPageBlueprint) => setResult({ ...result, blueprint })}
          onModelChange={setImageModel}
          onRegenerate={() => void handleAnalyze()}
          onConfirm={() => {
            setNotice("섹션별 이미지를 만들어 보세요.");
            setAppState("editor");
          }}
        />
      </div>
    );
  }

  if (appState === "editor" && result) {
    return (
      <PdpEditor
        key={`${activeDraftId ?? "new"}-${editorSessionKey}`}
        aspectRatio={aspectRatio}
        outputMode={outputMode}
        imageModel={imageModel}
        review={review}
        // 시나리오 화면의 '디자인 레퍼런스 쓰기' 토글을 여기서 지켜야 한다.
        // 그냥 styleReference 를 넘기면 껐는데도 반영된다 — 토글이 거짓말이 된다.
        styleReference={styleReferenceEnabled ? styleReference : undefined}
        preserveProduct={preserveProduct}
        characterId={characterId}
        startMode={startMode}
        desiredTone={desiredTone}
        initialDraftState={editorDraftState}
        initialResult={result}
        lastSavedAt={lastSavedAt}
        manualSaveToastToken={manualSaveToastToken}
        onDraftStateChange={setEditorDraftState}
        onManualSave={() => void persistDraft("manual", { showToast: true })}
        onOpenSettings={goToSettings}
        onReset={() => void handleReset()}
        apiConnectionLabel={apiConnectionLabel}
        referenceModelImage={modelImage}
        referenceModelUsage={modelImageUsage}
        saveState={saveState}
      />
    );
  }

  return (
    <div className="min-w-0">
      {/* 자체 헤더 제거(2026-07-21) — 셸이 좌측 내비와 <main> 을 제공한다.
          이전에는 셸의 <main> 안에 또 <main> 이 있었고 설정 링크가 중복이었다. */}
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-h1">상세페이지 새로 만들기</h1>
          <p className="mt-1 text-body text-muted-foreground">
            {startMode === "text"
              ? "판매하시는 것을 글로 적어주시면 AI가 구성부터 이미지까지 만들어 드립니다."
              : "상품 사진 한 장이면 됩니다. AI가 구성을 잡고 섹션 이미지를 만들어 드립니다."}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* 키가 없을 때 초록 배지를 쓰면 정상처럼 읽힌다. 경고 색으로 구분한다. */}
          <Badge variant={hasAvailableGeminiKey ? "green" : "destructive"}>API {apiConnectionLabel}</Badge>
          {preparedImage ? (
            /* 옛 UI에서는 제목 자체가 이 동작을 하는 버튼이었다(보이지 않는 조작).
               저장 확인 후 작업을 비우는 실제 기능이므로 명시적 버튼으로 남긴다. */
            <Button variant="outline" size="sm" onClick={() => void handleGoToMain()}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              처음부터 다시
            </Button>
          ) : null}
        </div>
      </div>

      <StepBar
        steps={CREATE_STEPS[startMode]}
        current={
          startMode === "text"
            ? textStage === "input"
              ? "upload"
              : "analyze"
            : appState === "processing"
              ? "analyze"
              : "upload"
        }
      />

      {/* 시작 방식. 사진이 없는 사람도 진입할 수 있어야 해서 두 갈래로 나눈다.
          2단계 이후 화면은 두 갈래가 동일하다. */}
      {appState !== "processing" ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {START_MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={startMode === option.value}
              onClick={() => setStartMode(option.value)}
              className={cn(
                "rounded-lg p-4 text-left transition-colors",
                startMode === option.value
                  ? "bg-primary-soft shadow-[0_0_0_2px_var(--primary-ring)]"
                  : "bg-card shadow-[var(--shadow-ring)] hover:bg-primary-soft/40",
              )}
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "grid h-4 w-4 flex-none place-items-center rounded-full border",
                    startMode === option.value ? "border-primary bg-primary" : "border-border",
                  )}
                >
                  {startMode === option.value ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  ) : null}
                </span>
                <strong className="text-sm">{option.label}</strong>
              </span>
              <span className="mt-1 block pl-6 text-sm text-muted-foreground">{option.desc}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!hasAvailableGeminiKey ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-none text-destructive" />
          <span>
            운영자 Gemini 서버 키가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.
          </span>
        </div>
      ) : null}

      {appState === "processing" ? (
        <section className="grid place-items-center gap-4 rounded-lg bg-card px-6 py-16 text-center shadow-[var(--shadow-ring)]">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-primary">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
          <div>
            <h2 className="text-h1">AI가 상세페이지 구조를 만드는 중입니다</h2>
            <p className="mt-1 text-body text-muted-foreground">{loadingStep}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
              <Badge variant="secondary">분석 단계 · 이미지 크레딧 0장</Badge>
              {analysisStartedAt ? <Badge variant="outline"><ElapsedTime startedAt={analysisStartedAt} /></Badge> : null}
            </div>
          </div>
          {/* 진행률을 알 수 없는 작업이라 무한 왕복 막대를 쓴다(가짜 퍼센트 대신). */}
          <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-[pdp-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        </section>
      ) : startMode === "text" ? (
        <TextModeFlow
          aspectRatio={aspectRatio}
          outputMode={outputMode}
          desiredTone={desiredTone}
          stage={textStage}
          onStageChange={setTextStage}
          onComplete={handleTextModeComplete}
        />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(320px,25vw,400px)]">
          <section className="grid gap-4">
          <section className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div>
                <span className="text-meta text-subtle-foreground">안내 사항</span>
                <h2 className="text-h2">사용 전 꼭 확인해 주세요</h2>
              </div>
              <Badge variant="green" className="ml-auto">작업 초안 브라우저 저장</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["성공한 이미지만 사용량에서 차감됩니다.", "분석은 무료이며 이미지 생성에 성공한 수만큼 월 한도에서 차감됩니다."],
                ["생성 속도는 Gemini API 서버 영향이 가장 큽니다.", "상세페이지 분석과 이미지 생성 시간은 서버보다 Gemini 응답 시간의 영향이 더 큽니다."],
                ["작업 초안은 서버에 저장되지 않습니다.", "편집 중인 작업과 결과는 현재 PC 브라우저에만 저장됩니다."],
                ["시크릿 모드에서는 저장 내용이 사라질 수 있습니다.", "브라우저 저장 공간을 비우면 저장된 작업이 보이지 않을 수 있습니다."],
              ].map(([title, desc]) => (
                <article key={title} className="rounded-md bg-background p-3.5 shadow-[var(--shadow-ring)]">
                  <strong className="block text-sm">{title}</strong>
                  <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
            <div className="mb-4 flex flex-wrap items-start gap-3">
              <div className="min-w-0">
                <span className="text-meta text-subtle-foreground">저장된 작업</span>
                <h2 className="text-h2">이어서 작업하기</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  수동 저장과 30초 자동 저장으로 남겨둔 초안을 바로 이어서 열 수 있습니다.
                </p>
                {/*
                  왜 목록이 계속 늘어나는지, 언제 줄어드는지 여기서 알린다.
                  안내 없이 지우면 "내 작업이 사라졌다"가 된다.
                */}
                <p className="mt-1 text-meta text-subtle-foreground">{DRAFT_RETENTION_NOTICE}</p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">자동 저장 30초</Badge>
                {lastSavedAt ? (
                  <Badge variant="secondary">최근 저장 {formatSavedDraftDate(lastSavedAt)}</Badge>
                ) : null}
                {drafts.length ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void handleDeleteAllDrafts()}
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    전체 삭제
                  </Button>
                ) : null}
              </div>
            </div>

            {isLoadingDrafts ? (
              <div className={emptyBoxClass}>
                <Loader2 className="h-4 w-4 animate-spin" />
                저장된 작업을 불러오는 중입니다.
              </div>
            ) : drafts.length ? (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]">
                {drafts.map((draft) => (
                  <article
                    key={draft.id}
                    className="flex flex-col overflow-hidden rounded-md bg-background shadow-[var(--shadow-ring)]"
                  >
                    <div className="relative">
                      <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-canvas text-subtle-foreground">
                        {draft.thumbnailUrl ? (
                          <img alt={draft.title} src={draft.thumbnailUrl} className="h-full w-full object-cover" />
                        ) : (
                          <Sparkles size={18} />
                        )}
                      </div>
                      <div className="absolute inset-x-2 top-2 flex justify-between gap-1">
                        <Badge variant="green">{draft.stageLabel}</Badge>
                        <Badge variant="secondary">{draft.aspectRatio}</Badge>
                      </div>
                    </div>

                    <div className="flex-1 p-3">
                      <div className="flex items-start gap-2">
                        <strong title={draft.title} className="min-w-0 flex-1 truncate text-sm">
                          {draft.title}
                        </strong>
                        <Badge variant="outline" className="flex-none">{draft.sectionCount}섹션</Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-subtle-foreground">
                        최근 저장 {formatSavedDraftDate(draft.updatedAt)}
                      </p>
                    </div>

                    <div className="flex gap-1.5 border-t p-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={isLoadingDraft}
                        onClick={() => void handleLoadDraft(draft.id)}
                      >
                        <FolderOpen size={14} className="mr-1.5" />
                        불러오기
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void handleDeleteDraft(draft.id)}
                        aria-label={`${draft.title} 삭제`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={emptyBoxClass}>
                <Clock3 size={16} />
                아직 저장된 작업이 없습니다. 이미지를 올리고 저장하면 이곳에서 다시 이어서 열 수 있습니다.
              </div>
            )}
          </section>

            <div className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
              <SectionHeading
                step={1}
                title="원본 이미지 업로드"
                desc="한 장만 올려도 됩니다. 업로드 후 AI 전송용으로 자동 압축합니다."
              />

              <UploadDropzone
                description="드래그 앤 드롭 또는 클릭으로 JPG, PNG, WEBP 파일을 선택할 수 있습니다."
                hint={preparedImage?.fileName ? `선택됨: ${preparedImageDisplayName}` : "권장 최대 10MB"}
                onSelect={handlePreparedImage}
                selectedFileName={preparedImage?.fileName}
                title="제품 이미지를 업로드하세요"
              />

              {/* 계정에 이미 있는 이미지를 다시 올리게 하지 않는다. */}
              <SavedImagePicker
                label="저장된 이미지에서 고르기"
                onPick={(file) => void handlePreparedImage(file)}
              />

              {preparedImage ? (
                <div className={previewCardClass}>
                  <div className={previewFrameClass}>
                    <img
                      alt={preparedImage.fileName}
                      className="h-full w-full object-contain"
                      src={preparedImage.previewUrl}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong title={preparedImage.fileName} className="block truncate text-sm">
                      {preparedImageDisplayName}
                    </strong>
                    <dl className="mt-2 grid gap-1.5 sm:grid-cols-3">
                      <MetaItem label="전송 포맷" value="JPEG 1024px" />
                      <MetaItem label="비율" value={selectedRatio.label} />
                      <MetaItem label="톤" value={selectedToneLabel} />
                    </dl>
                  </div>
                </div>
              ) : (
                <div className={hintBoxClass}>
                  <Sparkles size={18} className="mt-0.5 flex-none text-primary" />
                  <div>
                    <strong className="block text-sm">업로드 후 바로 미리보기가 들어옵니다.</strong>
                    <ul className={hintListClass}>
                      <li>배경이 너무 복잡하지 않은 제품컷이면 분석 품질이 더 안정적입니다.</li>
                      <li>투명 배경 PNG도 가능하지만, 제품이 충분히 크게 보이는 이미지를 추천합니다.</li>
                    </ul>
                  </div>
                </div>
              )}

            </div>

            <div className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
              <div className="mb-3 flex flex-wrap items-start gap-3">
                <div className="min-w-0">
                  <span className="text-meta text-subtle-foreground">선택 옵션</span>
                  <h3 className="text-h2">참조 이미지</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <strong className="text-foreground">제품과 인물은 그대로 지키고</strong>, 디자인은{" "}
                    <strong className="text-foreground">비슷하게 따라갑니다.</strong> 필요한 것만 골라도 됩니다.
                    1단계에 올린 제품 사진은 항상 그대로 유지됩니다.
                  </p>
                </div>
              </div>

              {/*
                사진과 캐릭터는 같은 일을 한다 — 둘 다 '이 얼굴을 써라'다.
                엔진도 하나만 쓴다(pdp.service.ts: 사진이 있으면 캐릭터는 무시).
                그래서 자리를 나누지 않고 한 곳에서 고르게 한다. 나란히 두면
                둘 다 반영되는 것처럼 보여 오해를 만든다.
              */}
              {/*
                인물과 디자인 레퍼런스는 하는 일이 다르다 — 하나는 '누가 나오는가',
                하나는 '어떤 디자인인가'다. 세로로 쌓으면 구분이 안 되고 가로 여백만
                남으므로 반으로 나눈다.

                사람 사진과 캐릭터는 같은 일(얼굴 정하기)이고 엔진도 하나만 쓰므로
                (pdp.service.ts: 사진이 있으면 캐릭터 무시) 한 칸에 둔다.
              */}
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="grid content-start gap-2 rounded-md bg-background p-3.5 shadow-[var(--shadow-ring)]">
                  <div className="min-h-[74px]">
                    <Badge variant="secondary">그대로 지킵니다</Badge>
                    <strong className="mt-1.5 block text-sm">인물 · 캐릭터</strong>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      인물 사진 1장 또는 다각도 캐릭터 중 하나만 씁니다. 둘 다 고르면 사진이 우선합니다.
                    </p>
                  </div>
                  {/*
                    레퍼런스 칸과 같은 모양·같은 자리에 둔다. 예전에는 올린 파일명이
                    '사진 올리기' 버튼 안에 작게 붙고 삭제 버튼은 섹션 헤더 끝에 있었다.
                    그래서 캐릭터 썸네일이 더 크게 보여 "캐릭터가 쓰인다"고 읽혔다.
                  */}
                  {modelImage ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/25 bg-primary-soft/40 px-3 py-2 text-sm">
                      <span title={modelImage.fileName} className="min-w-0 flex-1 truncate font-medium">
                        {modelImageDisplayName}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setModelImage(null);
                          setModelImageUsage(null);
                          setErrorMessage("");
                          setErrorDetail("");
                          setShowErrorDetail(false);
                          setNotice("인물 사진을 삭제했습니다. 일반 페르소나 설정으로 계속 편집할 수 있습니다.");
                        }}
                      >
                        <Trash2 size={14} className="mr-1.5" />
                        삭제
                      </Button>
                    </div>
                  ) : null}
                  {/* 고른 이미지는 위 줄과 아래 카드에 나오므로 여기는 버튼 한 줄이면 된다. */}
                  <UploadDropzone
                    slim
                    description=""
                    hint=""
                    onSelect={handleModelImage}
                    title="사진 올리기"
                  />
                  <SavedImagePicker
                    label="라이브러리에서 고르기"
                    origin="library"
                    excludeCharacterItems
                    onPick={(file) => void handleModelImage(file)}
                  />
                  <CharacterPicker
                    selectedId={characterId}
                    onSelect={setCharacterId}
                    ignoredReason={
                      modelImage
                        ? "올린 사진이 우선입니다. 이 캐릭터는 이번 생성에 쓰이지 않습니다."
                        : undefined
                    }
                  />
                </div>

                <div className="grid content-start gap-2 rounded-md bg-background p-3.5 shadow-[var(--shadow-ring)]">
                  <div className="min-h-[74px]">
                    <Badge variant="outline">비슷하게 따라갑니다</Badge>
                    <strong className="mt-1.5 block text-sm">디자인 레퍼런스</strong>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      레이아웃·분위기·폰트·색을 흉내 냅니다. 그 안의 제품·인물은 가져오지 않습니다.
                    </p>
                  </div>
                  {styleReference ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/25 bg-primary-soft/40 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{styleReference.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setStyleReference(undefined)}
                      >
                        <Trash2 size={14} className="mr-1.5" />
                        삭제
                      </Button>
                    </div>
                  ) : null}
                  <StyleReferenceAttach onAttached={setStyleReference} />

                </div>
              </div>

              {modelImage ? (
                <div className={previewCardClass}>
                  <div className={previewFrameClass}>
                    <img
                      alt={modelImage.fileName}
                      className="h-full w-full object-contain"
                      src={modelImage.previewUrl}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong title={modelImage.fileName} className="block truncate text-sm">
                      {modelImageDisplayName}
                    </strong>
                    <dl className="mt-2 grid gap-1.5 sm:grid-cols-3">
                      <MetaItem
                        label="적용 대상"
                        value={
                          modelImageUsage === "all-sections"
                            ? "전체 모델컷"
                            : modelImageUsage === "hero-only"
                              ? "히어로우 섹션"
                              : "선택 필요"
                        }
                      />
                      <MetaItem label="활용 방식" value="참조 모델" />
                      <MetaItem
                        label="편집 영향"
                        value={
                          modelImageUsage === "all-sections"
                            ? "타깃 페르소나 잠금"
                            : modelImageUsage === "hero-only"
                              ? "히어로우만 잠금"
                              : "선택 필요"
                        }
                      />
                    </dl>
                  </div>
                </div>
              ) : (
                <div className={hintBoxClass}>
                  <Sparkles size={18} className="mt-0.5 flex-none text-primary" />
                  <div>
                    <strong className="block text-sm">없어도 상세페이지 생성은 가능합니다.</strong>
                    <ul className={hintListClass}>
                      <li>히어로우에 특정 모델컷을 고정하고 싶을 때만 업로드하세요.</li>
                      <li>전체 일관성 유지를 고르면 모델컷 포함 시 동일 인물 기준으로 생성됩니다.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/*
                인물 미리보기 **바로 뒤**에 둔다. 인물의 '사용 방식' 설정 뒤로 밀면
                한참 아래 남의 영역처럼 보인다 — 실제로 그렇게 보였다.

                칸 안에는 이름만 두고 실물은 여기서 보여준다. 정책도 여기에 적는다 —
                무엇을 가져오고 무엇을 안 가져오는지가 중요하다.
              */}
              {styleReference ? (
                <div className={previewCardClass}>
                  <div className={previewFrameClass}>
                    {/*
                      저장된 레퍼런스라 next/image 최적화 대상이 아니다.

                      h-full 로 두면 세로 긴 상세페이지가 프레임(96px)을 넘어 잘린다.
                      레퍼런스는 대개 세로로 길다 — 잘리면 무엇을 붙였는지 알 수 없다.
                    */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={`${styleReference.name} 레퍼런스`}
                      className="max-h-24 max-w-24 object-contain"
                      src={`data:${styleReference.mimeType};base64,${styleReference.imageBase64}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong title={styleReference.name} className="block truncate text-sm">
                      {styleReference.name}
                    </strong>
                    <dl className="mt-2 grid gap-1.5 sm:grid-cols-3">
                      <MetaItem label="적용 대상" value="모든 섹션" />
                      <MetaItem label="가져오는 것" value="레이아웃·색·서체" />
                      <MetaItem label="가져오지 않는 것" value="제품·인물·문구" />
                    </dl>
                  </div>
                </div>
              ) : null}

              {modelImage ? (
                <div className="mt-3 rounded-md bg-background p-3.5 shadow-[var(--shadow-ring)]">
                  <strong className="block text-sm">모델 이미지 사용 방식</strong>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    이미지를 업로드했다면 아래 두 옵션 중 하나를 선택해야 분석을 시작할 수 있습니다.
                  </span>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        value: "hero-only" as const,
                        title: "히어로우에만 사용",
                        desc: "맨 첫 히어로우 섹션의 모델컷에만 업로드한 인물을 적용합니다.",
                      },
                      {
                        value: "all-sections" as const,
                        title: "전체 일관성 유지",
                        desc: "모델컷 포함 시 업로드한 인물을 계속 사용하고 타깃 페르소나 설정은 비활성화됩니다.",
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={modelImageUsage === option.value}
                        onClick={() => {
                          setModelImageUsage(option.value);
                          setErrorMessage("");
                        }}
                        className={cn(
                          "rounded-md bg-card p-3 text-left transition-colors",
                          modelImageUsage === option.value
                            ? "bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]"
                            : "shadow-[var(--shadow-ring)] hover:bg-muted"
                        )}
                      >
                        <strong className="block text-sm">{option.title}</strong>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{option.desc}</span>
                      </button>
                    ))}
                  </div>
                  {!modelImageUsage ? (
                    <div className="mt-2.5 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                      <AlertCircle size={16} className="flex-none" />
                      모델 이미지 사용 방식을 선택해야 AI 분석을 시작할 수 있습니다.
                    </div>
                  ) : null}
                </div>
              ) : null}

            </div>

            {errorMessage ? (
              <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4">
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle size={16} className="mt-0.5 flex-none text-destructive" />
                  {errorMessage}
                </div>
                {errorDetail ? (
                  <div className="mt-2.5">
                    <Button variant="outline" size="sm" onClick={() => setShowErrorDetail((current) => !current)}>
                      {showErrorDetail ? "로그 숨기기" : "로그 보기"}
                    </Button>
                    {showErrorDetail ? (
                      <div className="mt-2 rounded-md bg-card p-3 shadow-[var(--shadow-ring)]">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <strong className="text-xs">API Detail</strong>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigator.clipboard.writeText(errorDetail)}
                          >
                            <Copy size={14} className="mr-1.5" />
                            복사
                          </Button>
                        </div>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                          {errorDetail}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* 설정 레일 — 넓은 화면에서는 스크롤을 따라온다. */}
          <aside className="grid gap-4 xl:sticky xl:top-6">
            <div className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
              <SectionHeading
                step={2}
                title="생성 설정"
                desc="상품 맥락과 원하는 분위기를 정하면 첫 분석 결과가 훨씬 정확해집니다."
              />

              <div className="grid gap-4">
                {/*
                  사진으로는 대상·불편·차별점을 알 수 없다. 판매 원칙이 요구하는
                  것이 정확히 그 셋이라, 모르면 모델이 일반론으로 메운다.

                  예전에는 자유 입력 한 칸이었다. 무엇을 적을지 알려주지 않으니
                  "20대 여성, 여름" 같은 조각만 들어왔다 — 칸을 나누는 것이 곧 안내다.
                  전부 선택이다. 다 채워야 시작할 수 있으면 사진 경로의 미덕인
                  '빠름'이 사라진다.
                */}
                <div>
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                    <span className={fieldLabelClass + " mb-0"}>파는 사람만 아는 것</span>
                    <span className="text-meta text-subtle-foreground">
                      비워도 됩니다. 적을수록 문구가 이 제품에 가까워집니다.
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {SELLER_BRIEF_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label
                          className="mb-1 block text-meta text-subtle-foreground"
                          htmlFor={`brief-${field.key}`}
                        >
                          {field.label}
                        </label>
                        <input
                          id={`brief-${field.key}`}
                          value={sellerBrief[field.key] ?? ""}
                          onChange={(event) =>
                            setSellerBrief((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                          placeholder={field.placeholder}
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={fieldLabelClass} htmlFor="additionalInfo">
                    그 밖에
                  </label>
                  <textarea
                    id="additionalInfo"
                    rows={3}
                    value={additionalInfo}
                    onChange={(event) => setAdditionalInfo(event.target.value)}
                    placeholder="예: 네이버 스마트스토어용, 여름 시즌, 프리미엄 보습 이미지 강조"
                    className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]"
                  />
                </div>

                {/*
                  표현 강도와 빈칸 처리. 텍스트 경로에만 있던 손잡이다 —
                  같은 사람이 같은 제품을 파는데 들어온 길에 따라 조절기가
                  사라지면 안 된다. 목록은 copy-controls.ts 가 단일 출처다.
                */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <fieldset className="grid gap-1.5">
                    <legend className={fieldLabelClass + " mb-0"}>표현 강도</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {COPY_INTENSITIES.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          title={option.hint}
                          variant={copyIntensity === option.value ? "default" : "outline"}
                          onClick={() => setCopyIntensity(option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <span className="text-meta text-subtle-foreground">
                      {COPY_INTENSITIES.find((o) => o.value === copyIntensity)?.hint}
                    </span>
                  </fieldset>
                  <fieldset className="grid gap-1.5">
                    <legend className={fieldLabelClass + " mb-0"}>{GAP_POLICY_LEGEND.photo}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {GAP_POLICIES.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          title={option.hint}
                          variant={gapPolicy === option.value ? "default" : "outline"}
                          onClick={() => setGapPolicy(option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <span className="text-meta text-subtle-foreground">
                      {GAP_POLICIES.find((o) => o.value === gapPolicy)?.hint}
                    </span>
                  </fieldset>
                </div>

                <div>
                  <span className={fieldLabelClass}>원하는 톤</span>
                  <div className="flex flex-wrap gap-1.5">
                    {TONE_OPTIONS.map((tone) => {
                      const value = tone === "AI 자동 추천" ? "" : tone;
                      const isActive = desiredTone === value;

                      return (
                        <button
                          key={tone}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setDesiredTone(value)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground shadow-[var(--shadow-ring)] hover:bg-muted"
                          )}
                        >
                          {tone}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className={fieldLabelClass}>이미지 비율</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {RATIO_OPTIONS.map((option) => {
                      const isActive = option.value === aspectRatio;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setAspectRatio(option.value)}
                          className={cn(
                            "grid gap-0.5 rounded-md p-2.5 text-left transition-colors",
                            isActive
                              ? "bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]"
                              : "bg-background shadow-[var(--shadow-ring)] hover:bg-muted"
                          )}
                        >
                          <span className={isActive ? "text-primary" : "text-subtle-foreground"}>
                            {renderRatioIcon(option.icon)}
                          </span>
                          <strong className="text-sm">{option.label}</strong>
                          <small className="text-xs text-muted-foreground">{option.description}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
              <div className="flex items-center gap-1.5 text-h3">
                <Sparkles size={16} className="text-primary" />
                현재 세션 안내
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{notice}</p>
              <dl className="mt-3 grid gap-1.5">
                <MetaItem label="선택한 톤" value={selectedToneLabel} row />
                <MetaItem label="선택한 비율" value={selectedRatio.label} row />
                <MetaItem
                  label="저장 상태"
                  row
                  value={
                    saveState === "saving"
                      ? "저장 중"
                      : lastSavedAt
                        ? formatSavedDraftDate(lastSavedAt)
                        : "미저장"
                  }
                />
              </dl>
            </div>

            <div>
              <Button className="w-full" size="lg" disabled={!canAnalyze} onClick={handleAnalyze}>
                <Wand2 size={16} className="mr-1.5" />
                AI 분석 시작하기
              </Button>
              <div className="mt-2 rounded-md bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
                <strong className="text-foreground">이 단계의 이미지 크레딧: 0장</strong><br />
                상세 구조만 분석합니다. 분석이 끝난 뒤 필요한 섹션 이미지를 선택해 생성하며, 성공한 이미지마다 1장씩 차감됩니다.
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/* 되풀이되는 표면 클래스. 카드마다 손으로 적으면 한 곳만 어긋난다. */
const emptyBoxClass =
  "flex items-center justify-center gap-2 rounded-md bg-background px-4 py-8 text-sm text-muted-foreground shadow-[var(--shadow-ring)]";
/**
 * 파는 사람에게 물을 것. 무엇을 묻는지가 곧 안내라서 문구가 중요하다.
 *
 * 순서는 판매 원칙의 순서를 따른다 — 대상을 좁히고, 그 사람의 장면을 짚고,
 * 경쟁자가 못 하는 말을 찾는다.
 */
const SELLER_BRIEF_FIELDS: ReadonlyArray<{
  key: "audience" | "problem" | "differentiator";
  label: string;
  placeholder: string;
}> = [
  {
    key: "audience",
    label: "누구에게 파나요",
    placeholder: "예: 아침에 화장이 밀려 스킨만 바르고 나가는 30대 직장인",
  },
  {
    key: "problem",
    label: "그 사람이 겪는 불편은",
    placeholder: "예: 세럼을 바르면 손이 끈적여 다시 씻어야 한다",
  },
  {
    key: "differentiator",
    label: "남과 다른 점은",
    placeholder: "예: 점증제를 안 넣어 물처럼 묽다 / 3대째 같은 방식으로 만든다",
  },
];

const previewCardClass =
  "mt-3 flex flex-wrap gap-3 rounded-md bg-background p-3 shadow-[var(--shadow-ring)]";
const previewFrameClass =
  "grid h-24 w-24 flex-none place-items-center overflow-hidden rounded-md bg-canvas";
const hintBoxClass =
  "mt-3 flex gap-2.5 rounded-md bg-background p-3.5 shadow-[var(--shadow-ring)]";
const hintListClass = "mt-1.5 grid list-disc gap-1 pl-4 text-sm text-muted-foreground";
const fieldLabelClass = "mb-1.5 block text-h3";

function SectionHeading({ step, title, desc }: { step: number; title: string; desc: string }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-h2">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function MetaItem({ label, value, row }: { label: string; value: string; row?: boolean }) {
  return (
    <div className={cn("min-w-0", row && "flex items-center justify-between gap-2")}>
      <dt className="text-meta text-subtle-foreground">{label}</dt>
      <dd className={cn("truncate text-sm font-bold", !row && "mt-0.5")}>{value}</dd>
    </div>
  );
}

function UploadDropzone({
  compact = false,
  /**
   * 고른 이미지가 이 안에 보이지 않는 자리에서 쓴다(미리보기가 아래 카드로 나가는 경우).
   * 큰 드롭 영역은 자리만 차지하고 아무것도 알려주지 않으므로 버튼 한 줄로 줄인다.
   */
  slim = false,
  description,
  hint,
  onSelect,
  selectedFileName,
  title
}: {
  compact?: boolean;
  slim?: boolean;
  description: string;
  hint: string;
  onSelect: (file: File) => Promise<void>;
  selectedFileName?: string;
  title: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      await onSelect(file);
    }
  };

  return (
    <>
      <input
        accept="image/*"
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) {
            await onSelect(file);
          }
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />

      {slim ? (
        <button
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md border border-dashed bg-background px-3 py-2.5 text-sm transition-colors",
            dragActive ? "border-primary bg-primary-soft" : "hover:border-primary/50 hover:bg-muted",
          )}
          onClick={() => inputRef.current?.click()}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          type="button"
        >
          <Upload size={15} className="flex-none text-primary" />
          <span className="min-w-0 truncate">{selectedFileName ? `선택됨: ${selectedFileName}` : title}</span>
        </button>
      ) : (
      <button
        /* 이전에는 드래그 중일 때 삼항이 기본 클래스를 통째로 버려서
           테두리·여백이 사라졌다. 기본 + 상태로 분리한다. */
        className={cn(
          "grid w-full place-items-center gap-1.5 rounded-md border border-dashed bg-background text-center transition-colors",
          compact ? "px-4 py-5" : "px-4 py-8",
          dragActive
            ? "border-primary bg-primary-soft"
            : "hover:border-primary/50 hover:bg-muted"
        )}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        type="button"
      >
        <span
          className={cn(
            "grid place-items-center rounded-full",
            compact ? "h-9 w-9" : "h-11 w-11",
            dragActive ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary"
          )}
        >
          <Upload size={compact ? 18 : 22} />
        </span>
        <strong className="text-sm">{title}</strong>
        <p className="text-xs text-muted-foreground">{description}</p>
        <span className="text-xs text-subtle-foreground">
          {selectedFileName ? `선택됨: ${selectedFileName}` : hint}
        </span>
      </button>
      )}
    </>
  );
}

function renderRatioIcon(icon: "square" | "portrait" | "phone" | "landscape" | "wide") {
  if (icon === "square") {
    return <Square size={18} />;
  }
  if (icon === "portrait") {
    return <RectangleVertical size={18} />;
  }
  if (icon === "phone") {
    return <Smartphone size={18} />;
  }
  if (icon === "wide") {
    return <RectangleHorizontal size={18} style={{ transform: "scaleX(1.2)" }} />;
  }
  return <RectangleHorizontal size={18} />;
}

function createDefaultEditorDraftState(result: GeneratedResult, outputMode?: PdpOutputMode): PdpEditorDraftState {
  const sections = result.blueprint.sections.map((section) => ({ ...section }));

  return {
    currentSectionIndex: 0,
    sections,
    sectionKeys: buildSectionKeys(sections),
    sectionOptions: {},
    overlaysBySection: {},
    defaultCopyLanguage: "ko",
    notice:
      outputMode === "full-image"
        ? "통이미지 모드 — 문구가 이미지에 포함돼 있어요. 확인하고 바로 다운로드하세요."
        : "섹션 컷을 고르고 텍스트를 배치한 뒤 바로 다운로드할 수 있습니다.",
    workbenchTab: "image",
    workbenchState: {
      x: 756,
      y: 24,
      width: 332,
      height: 500,
      isOpen: true
    }
  };
}

function formatSavedDraftDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "방금";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatCompactFileName(fileName: string, maxBaseLength = 30) {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return fileName;
  }

  const lastDotIndex = trimmed.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < trimmed.length - 1;
  const extension = hasExtension ? trimmed.slice(lastDotIndex) : "";
  const baseName = hasExtension ? trimmed.slice(0, lastDotIndex) : trimmed;

  if (baseName.length <= maxBaseLength) {
    return trimmed;
  }

  const leadingLength = Math.max(14, Math.floor(maxBaseLength * 0.58));
  const trailingLength = Math.max(8, maxBaseLength - leadingLength);
  return `${baseName.slice(0, leadingLength)}…${baseName.slice(-trailingLength)}${extension}`;
}
