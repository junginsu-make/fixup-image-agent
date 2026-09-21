"use client";

import { useEffect, useState } from "react";
import { takeHandoff } from "../../lib/handoff";
import { AlertCircle } from "lucide-react";
import {
  DEFAULT_IMAGE_MODEL,
  collectUnverified,
  defaultPreserveProduct,
  mergeArtDirection,
} from "@fixup/pdp-core";
import type {
  AttachmentIntents,
  AspectRatio,
  BlueprintReview,
  CopyIntensity,
  GapPolicy,
  GeneratedResult,
  ImageModelId,
  PersonSource,
  KeyVisualResponse,
  LandingPageBlueprint,
  PdpOutputMode,
  ProductBrief,
  TextPlanResponse,
  PdpLlmExecution,
} from "@fixup/pdp-core";
import { KeyVisualGate } from "./KeyVisualGate";
import { ScenarioEditor } from "./ScenarioEditor";
import type { StyleReferenceView } from "./StyleReferenceCard";
import { TextBriefInput } from "./TextBriefInput";
import { UnverifiedReview } from "./UnverifiedReview";
import { apiJson, toAnchorImage, toDataUrl } from "./pdp-utils";
import { replaceBlueprintState } from "./text-plan-state";
import type { PdpTextDraftState } from "./pdp-drafts";
import { stableSections } from "./document-state";
import { DEFAULT_PAGE_GOAL, DEFAULT_PRODUCT_KIND, type PageGoal, type ProductKind } from "@fixup/pdp-core";

/**
 * 텍스트 진입 경로 전체를 담는다.
 *
 * 입력 → 시나리오 확인·수정 → 대표 이미지 승인까지 끝나면 기존 이미지 흐름과
 * 똑같은 GeneratedResult 를 만들어 넘긴다. 그 뒤 단계(섹션 생성·편집)는
 * 기존 PdpEditor 가 그대로 처리한다.
 */

export type TextStage = "input" | "scenario" | "unverifiedReview" | "keyVisual";

interface TextModeFlowProps {
  initialDraft?: PdpTextDraftState | null;
  onDraftChange?: (draft: PdpTextDraftState) => void;
  onBeforeReplace?: () => Promise<boolean>;
  /** 첨부 자리별 지시. 글로 시작해도 레퍼런스·캐릭터는 붙일 수 있다. */
  attachmentIntents: AttachmentIntents;
  onIntentChange: (slot: keyof AttachmentIntents, value: string) => void;
  aspectRatio: AspectRatio;
  outputMode: PdpOutputMode;
  desiredTone: string;
  stage: TextStage;
  onStageChange: (stage: TextStage) => void;
  /** 사진 모드에서 올린 인물 사진의 이름. 있으면 캐릭터와 충돌한다(U-04). */
  referenceModelName?: string;
  onComplete: (
    result: GeneratedResult,
    imageModel: ImageModelId,
    review?: BlueprintReview,
    styleReference?: StyleReferenceView,
    preserveProduct?: boolean,
    characterId?: string,
    /** 고른 각도. 비어 있으면 자동 — 서버가 섹션에 맞춰 고른다. */
    characterAngles?: string[],
    /**
     * 인물 사진과 캐릭터를 **둘 다 골랐을 때** 누구를 쓸 것인가(U-04).
     *
     * 글 경로에도 이 충돌이 온다 — 사진 모드에서 인물을 올린 뒤 글 모드로
     * 바꾸면 그 사진이 남는다.
     */
    personSource?: PersonSource,
  ) => void;
}

type KeyVisualImage = { base64: string; mimeType: string };

function errorText(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function TextModeFlow({
  initialDraft,
  onDraftChange,
  onBeforeReplace,
  attachmentIntents,
  onIntentChange,
  aspectRatio,
  outputMode,
  desiredTone,
  stage,
  onStageChange,
  referenceModelName,
  onComplete,
}: TextModeFlowProps) {
  const [text, setText] = useState(initialDraft?.text ?? "");
  const [fromLibrary, setFromLibrary] = useState<string | null>(null);

  // 라이브러리에서 「상세페이지로」를 눌러 왔으면 글이 이미 들어가 있어야 한다.
  useEffect(() => {
    const handoff = takeHandoff();
    if (!handoff?.text) return;
    setText(handoff.text);
    setFromLibrary(handoff.title);
  }, []);
  const [copyIntensity, setCopyIntensity] = useState<CopyIntensity>(initialDraft?.copyIntensity ?? "normal");
  const [gapPolicy, setGapPolicy] = useState<GapPolicy>(initialDraft?.gapPolicy ?? "ask");
  /*
    **글로 시작한다는 것은 입력 방식일 뿐이다**(K-08).

    전에는 그것이 곧 「무형 상품」으로 읽혀, 사진 없는 실물을 파는 사람이
    은유로 채운 페이지를 받았다. 무엇을 파는지와 무엇을 하러 왔는지는 따로
    받는다.
  */
  const [productKind, setProductKind] = useState<ProductKind>(DEFAULT_PRODUCT_KIND);
  const [pageGoal, setPageGoal] = useState<PageGoal>(DEFAULT_PAGE_GOAL);
  const [brief, setBrief] = useState<ProductBrief | null>(initialDraft?.brief ?? null);
  // 이미지 방향을 사용자가 고쳤는지 비교하려면 최초 시나리오를 그대로 들고 있어야 한다.
  const [originalBlueprint, setOriginalBlueprint] = useState<LandingPageBlueprint | null>(initialDraft?.originalBlueprint ?? null);
  const [blueprint, setBlueprint] = useState<LandingPageBlueprint | null>(initialDraft?.blueprint ?? null);
  // 판매 원칙 심사 결과. 두 번 다시 만들고도 남은 지적은 숨기지 않고 화면에 띄운다.
  const [review, setReview] = useState<BlueprintReview | undefined>(initialDraft?.review);
  // 추천된 디자인 레퍼런스와 그것을 쓸지 여부. 반영 강도가 "디자인 전체"라
  // 무엇이 씌워지는지 보여주고 끌 수 있어야 한다.
  const [styleReference, setStyleReference] = useState<StyleReferenceView | undefined>(initialDraft?.styleReference);
  const [styleReferenceEnabled, setStyleReferenceEnabled] = useState(initialDraft?.styleReferenceEnabled ?? true);
  // 처음 위치는 상품 유형으로 잡는다 — 무형 상품은 지킬 실물이 없다.
  // 추론이 틀릴 수 있으므로 화면에서 바꿀 수 있게 둔다.
  const [preserveProduct, setPreserveProduct] = useState(initialDraft?.preserveProduct ?? true);
  const [personSource, setPersonSource] = useState(initialDraft?.personSource);
  const [characterId, setCharacterId] = useState<string | undefined>(initialDraft?.characterId);
  // 비어 있으면 자동이다. `create/CharacterPicker.tsx` 머리말 참조.
  const [characterAngles, setCharacterAngles] = useState<string[]>(initialDraft?.characterAngles ?? []);
  const [keyVisual, setKeyVisual] = useState<KeyVisualImage | null>(initialDraft?.keyVisual ?? null);
  const [imageModel, setImageModel] = useState<ImageModelId>(initialDraft?.imageModel ?? DEFAULT_IMAGE_MODEL);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [planningExecutions, setPlanningExecutions] = useState<PdpLlmExecution[] | undefined>(initialDraft?.planningExecutions);

  useEffect(() => {
    onDraftChange?.({ stage, text, brief, blueprint, originalBlueprint, review, styleReference,
      styleReferenceEnabled, preserveProduct, personSource, characterId, characterAngles, keyVisual,
      imageModel, copyIntensity, gapPolicy, planningExecutions });
  }, [onDraftChange, stage, text, brief, blueprint, originalBlueprint, review, styleReference,
    styleReferenceEnabled, preserveProduct, personSource, characterId, characterAngles, keyVisual,
    imageModel, copyIntensity, gapPolicy, planningExecutions]);

  const handlePlan = async () => {
    setIsBusy(true);
    setErrorMessage("");
    try {
      if ((blueprint || keyVisual) && onBeforeReplace && !(await onBeforeReplace())) {
        setErrorMessage("이전 작업을 보관하지 못해 다시 기획하기를 중단했습니다."); return;
      }
      const response = await apiJson<TextPlanResponse>("/pdp/plan-from-text", {
        method: "POST",
        body: JSON.stringify({
          text,
          productKind,
          pageGoal,
          aspectRatio,
          outputMode,
          desiredTone: desiredTone.trim() || undefined,
          copyIntensity,
          gapPolicy,
        }),
      });

      if (!response.ok) {
        setErrorMessage(response.message);
        return;
      }

      setBrief(response.result.brief);
      setPlanningExecutions(response.result.planningExecutions);
      const replacement = replaceBlueprintState({ ...response.result.blueprint, sections: stableSections(response.result.blueprint.sections) });
      setOriginalBlueprint(replacement.originalBlueprint);
      setBlueprint(replacement.blueprint);
      setReview(response.result.review);
      setStyleReference(response.result.styleReference);
      setPreserveProduct(
        defaultPreserveProduct({
          startedFromImage: false,
          offeringKind: response.result.brief.offeringKind,
        }),
      );
      setStyleReferenceEnabled(Boolean(response.result.styleReference));
      setKeyVisual(null);
      onStageChange("scenario");
    } catch (error) {
      setErrorMessage(`서버와 통신하지 못했습니다. ${errorText(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const requestKeyVisual = async (source: LandingPageBlueprint) => {
    if (!brief) return;
    setIsBusy(true);
    setErrorMessage("");
    try {
      if (keyVisual && onBeforeReplace && !(await onBeforeReplace())) {
        setErrorMessage("이전 대표 이미지를 보관하지 못해 재생성을 중단했습니다."); return;
      }
      const response = await apiJson<KeyVisualResponse>("/pdp/key-visual", {
        method: "POST",
        body: JSON.stringify({ brief, blueprint: source, aspectRatio, imageModel }),
      });

      if (!response.ok) {
        setErrorMessage(response.message);
        return;
      }

      setKeyVisual({ base64: response.imageBase64, mimeType: response.mimeType });
    } catch (error) {
      setErrorMessage(`서버와 통신하지 못했습니다. ${errorText(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmScenario = async () => {
    if (!blueprint) return;
    if (collectUnverified(blueprint).length > 0) {
      onStageChange("unverifiedReview");
      return;
    }
    await handleConfirmedBlueprint(blueprint);
  };

  const handleConfirmedBlueprint = async (source: LandingPageBlueprint) => {
    setBlueprint(source);
    onStageChange("keyVisual");
    setKeyVisual(null);
    await requestKeyVisual(source);
  };

  const handleApprove = async () => {
    if (!blueprint || !originalBlueprint || !keyVisual) return;
    setIsBusy(true);
    try {
      // 대표 이미지는 2K로 생성된다. 섹션마다 다시 올라가는 앵커라
      // 업로드 이미지와 같은 규격(1024px)으로 줄여서 넘긴다.
      const anchor = await toAnchorImage(keyVisual.base64, keyVisual.mimeType);
      // 고친 한국어 이미지 방향을 실제 생성에 쓰이는 prompt_en 에 반영한 뒤 넘긴다.
      onComplete(
        {
          originalImage: anchor.base64,
          blueprint: mergeArtDirection(originalBlueprint, blueprint),
          review,
          planningExecutions,
        },
        imageModel,
        review,
        styleReferenceEnabled ? styleReference : undefined,
        preserveProduct,
        characterId,
        characterAngles,
        personSource,
      );
    } catch (error) {
      setErrorMessage(`대표 이미지를 준비하지 못했습니다. ${errorText(error)}`);
      setIsBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      {planningExecutions?.some((entry) => entry.fallbackFrom) ? <p role="status" className="text-sm text-muted-foreground">대체 기획 모델로 구성안을 만들었습니다. 내용을 확인해 주세요.</p> : null}
      {errorMessage ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-none text-destructive" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {stage === "input" ? (
        <TextBriefInput
          productKind={productKind}
          pageGoal={pageGoal}
          onProductKindChange={setProductKind}
          onPageGoalChange={setPageGoal}
          value={text}
          copyIntensity={copyIntensity}
          gapPolicy={gapPolicy}
          isBusy={isBusy}
          onChange={setText}
          onCopyIntensityChange={setCopyIntensity}
          onGapPolicyChange={setGapPolicy}
          onSubmit={() => void handlePlan()}
        />
      ) : null}

      {stage === "scenario" && brief && blueprint ? (
        <ScenarioEditor
          attachmentIntents={attachmentIntents}
          onIntentChange={onIntentChange}
          brief={brief}
          blueprint={blueprint}
          review={review}
          styleReference={styleReference}
          styleReferenceEnabled={styleReferenceEnabled}
          onStyleReferenceToggle={setStyleReferenceEnabled}
          preserveProduct={preserveProduct}
          referenceModelName={referenceModelName}
          personSource={personSource}
          onPersonSourceChange={setPersonSource}
          onPreserveProductChange={setPreserveProduct}
          characterId={characterId}
          characterAngles={characterAngles}
          onCharacterChange={(id, angles) => {
            setCharacterId(id);
            setCharacterAngles(angles);
          }}
          onStyleReferenceAttached={(reference) => {
            // 사용자가 직접 고른 것이다. 추천을 다시 돌려 다른 것이 뽑히면 배신이다.
            setStyleReference(reference);
            setStyleReferenceEnabled(true);
          }}
          outputMode={outputMode}
          imageModel={imageModel}
          isBusy={isBusy}
          onChange={setBlueprint}
          onModelChange={setImageModel}
          onRegenerate={() => onStageChange("input")}
          onConfirm={() => void handleConfirmScenario()}
        />
      ) : null}

      {stage === "unverifiedReview" && blueprint ? (
        <UnverifiedReview
          blueprint={blueprint}
          onChange={setBlueprint}
          onConfirm={(next) => void handleConfirmedBlueprint(next)}
          onBack={() => onStageChange("scenario")}
        />
      ) : null}

      {stage === "keyVisual" ? (
        <KeyVisualGate
          previewUrl={keyVisual ? toDataUrl(keyVisual.mimeType, keyVisual.base64) : null}
          isBusy={isBusy}
          onApprove={() => void handleApprove()}
          onRegenerate={() => void (blueprint && requestKeyVisual(blueprint))}
          onBack={() => onStageChange("scenario")}
        />
      ) : null}
    </div>
  );
}
