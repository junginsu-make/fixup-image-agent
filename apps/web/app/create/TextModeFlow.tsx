"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  DEFAULT_IMAGE_MODEL,
  collectUnverified,
  defaultPreserveProduct,
  mergeArtDirection,
} from "@fixup/pdp-core";
import type {
  AspectRatio,
  BlueprintReview,
  CopyIntensity,
  GapPolicy,
  GeneratedResult,
  ImageModelId,
  KeyVisualResponse,
  LandingPageBlueprint,
  PdpOutputMode,
  ProductBrief,
  TextPlanResponse,
} from "@fixup/pdp-core";
import { KeyVisualGate } from "./KeyVisualGate";
import { ScenarioEditor } from "./ScenarioEditor";
import type { StyleReferenceView } from "./StyleReferenceCard";
import { TextBriefInput } from "./TextBriefInput";
import { UnverifiedReview } from "./UnverifiedReview";
import { apiJson, toAnchorImage, toDataUrl } from "./pdp-utils";
import { replaceBlueprintState } from "./text-plan-state";

/**
 * 텍스트 진입 경로 전체를 담는다.
 *
 * 입력 → 시나리오 확인·수정 → 대표 이미지 승인까지 끝나면 기존 이미지 흐름과
 * 똑같은 GeneratedResult 를 만들어 넘긴다. 그 뒤 단계(섹션 생성·편집)는
 * 기존 PdpEditor 가 그대로 처리한다.
 */

export type TextStage = "input" | "scenario" | "unverifiedReview" | "keyVisual";

interface TextModeFlowProps {
  aspectRatio: AspectRatio;
  outputMode: PdpOutputMode;
  desiredTone: string;
  stage: TextStage;
  onStageChange: (stage: TextStage) => void;
  onComplete: (
    result: GeneratedResult,
    imageModel: ImageModelId,
    review?: BlueprintReview,
    styleReference?: StyleReferenceView,
    preserveProduct?: boolean,
    characterId?: string,
  ) => void;
}

type KeyVisualImage = { base64: string; mimeType: string };

function errorText(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function TextModeFlow({
  aspectRatio,
  outputMode,
  desiredTone,
  stage,
  onStageChange,
  onComplete,
}: TextModeFlowProps) {
  const [text, setText] = useState("");
  const [copyIntensity, setCopyIntensity] = useState<CopyIntensity>("normal");
  const [gapPolicy, setGapPolicy] = useState<GapPolicy>("ask");
  const [brief, setBrief] = useState<ProductBrief | null>(null);
  // 이미지 방향을 사용자가 고쳤는지 비교하려면 최초 시나리오를 그대로 들고 있어야 한다.
  const [originalBlueprint, setOriginalBlueprint] = useState<LandingPageBlueprint | null>(null);
  const [blueprint, setBlueprint] = useState<LandingPageBlueprint | null>(null);
  // 판매 원칙 심사 결과. 두 번 다시 만들고도 남은 지적은 숨기지 않고 화면에 띄운다.
  const [review, setReview] = useState<BlueprintReview | undefined>(undefined);
  // 추천된 디자인 레퍼런스와 그것을 쓸지 여부. 반영 강도가 "디자인 전체"라
  // 무엇이 씌워지는지 보여주고 끌 수 있어야 한다.
  const [styleReference, setStyleReference] = useState<StyleReferenceView | undefined>(undefined);
  const [styleReferenceEnabled, setStyleReferenceEnabled] = useState(true);
  // 처음 위치는 상품 유형으로 잡는다 — 무형 상품은 지킬 실물이 없다.
  // 추론이 틀릴 수 있으므로 화면에서 바꿀 수 있게 둔다.
  const [preserveProduct, setPreserveProduct] = useState(true);
  const [characterId, setCharacterId] = useState<string | undefined>(undefined);
  const [keyVisual, setKeyVisual] = useState<KeyVisualImage | null>(null);
  const [imageModel, setImageModel] = useState<ImageModelId>(DEFAULT_IMAGE_MODEL);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handlePlan = async () => {
    setIsBusy(true);
    setErrorMessage("");
    try {
      const response = await apiJson<TextPlanResponse>("/pdp/plan-from-text", {
        method: "POST",
        body: JSON.stringify({
          text,
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
      const replacement = replaceBlueprintState(response.result.blueprint);
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
        },
        imageModel,
        review,
        styleReferenceEnabled ? styleReference : undefined,
        preserveProduct,
        characterId,
      );
    } catch (error) {
      setErrorMessage(`대표 이미지를 준비하지 못했습니다. ${errorText(error)}`);
      setIsBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      {errorMessage ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-none text-destructive" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {stage === "input" ? (
        <TextBriefInput
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
          brief={brief}
          blueprint={blueprint}
          review={review}
          styleReference={styleReference}
          styleReferenceEnabled={styleReferenceEnabled}
          onStyleReferenceToggle={setStyleReferenceEnabled}
          preserveProduct={preserveProduct}
          onPreserveProductChange={setPreserveProduct}
          characterId={characterId}
          onCharacterChange={setCharacterId}
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
