import { isVisibleImageModel } from "@fixup/shared";

/**
 * 리디자인의 **그림 모델과 분석 AI** — 화면과 서버가 함께 쓰는 한 벌.
 *
 * 화면이 들여오므로 서버 전용 물건(fal·키)을 들이지 않는다. 그래서
 * `image-generator.ts` 에 두지 않고 여기 둔다.
 *
 * 리디자인도 다른 도구처럼 세 모델(표준형·디테일형·속도형) 중에서 고른다
 * (2026-10-08 사용자 결정). 원본을 읽는 분석 AI 는 고른 그림 모델의 계열을
 * 따른다 — 서버 키 확인·요청의 `model` 이 이것이다.
 */

/** 리디자인의 기본 그림 모델. 다른 도구의 기본값(표준형)과 같은 것을 쓴다. */
export const REDESIGN_FAL_MODEL = "gpt-image-2.5-flare";

export type AnalysisProvider = "openai" | "google";

/** 그림 모델 → 원본을 읽을 분석 AI. GPT 그림이면 OpenAI, 그 밖은 Google. */
export function analysisProviderFor(imageModel: string): AnalysisProvider {
  return String(imageModel).startsWith("gpt-image") ? "openai" : "google";
}

/**
 * **실제로 그릴 모델.**
 *
 * 고른 그림 모델(`imageModel`)이 보이는 셋이면 그것이다. 없으면 — 저장된 옛
 * 작업이나 옛 탭의 요청 — 분석 AI 선택(`choice`)에서 전과 같이 읽는다:
 * `google` 이면 디테일형(nano-banana-pro), 그 밖은 표준형.
 *
 * fal 통로가 붙은 뒤로 무엇을 고르든 한 모델이 그렸고, 선택은 값을 매기는 데만
 * 쓰였다(2026-09-17 리뷰 F-7-4). 그래서 그리는 것·값 매기는 것이 모두 이 값을 본다.
 */
export function redesignFalModelFor(choice: string | undefined, imageModel?: string): string {
  if (isVisibleImageModel(imageModel)) return String(imageModel);
  return String(choice) === "google" ? "nano-banana-pro" : REDESIGN_FAL_MODEL;
}

/**
 * **이 작업을 그린 그림 모델** — 이어 그리기·고치기의 기본값.
 *
 * 옛 작업(`imageModel` 없음)은 `model` 에서 읽는다. 보이는 셋이 아니면 기본(표준형)으로.
 */
export function projectImageModel(project: { model?: string; imageModel?: string }): string {
  const drawn = redesignFalModelFor(project.model, project.imageModel);
  return isVisibleImageModel(drawn) ? drawn : REDESIGN_FAL_MODEL;
}

/**
 * **이 요청이 쓸 그림 모델.** 이미 있는 작업에 이어 그리면(나머지 섹션, 여러 장의
 * 둘째 장부터) 그 작업의 모델을 따른다 — 작업 공간에서 지금 고른 값이 아니다.
 * 새로 만들 때만 고른 값(`selected`)을 쓴다.
 */
export function requestImageModel(
  selected: string,
  baseProject?: { model?: string; imageModel?: string } | null,
): string {
  return baseProject ? projectImageModel(baseProject) : selected;
}

/**
 * 요청에 실린 두 값이 말이 되는가. 서버 경계(`lib/pdp/request.ts`)가 본다.
 *
 * `imageModel` 이 없으면 옛 요청이라 통과한다. 있으면 **보이는 셋**이어야 하고,
 * 분석 AI(`model`, 없으면 openai)가 그 모델을 따라야 한다 — 어긋나면 키 확인은
 * 한 업체로, 그림은 다른 계열로 나가 화면이 본 것과 서버가 한 일이 갈린다.
 */
export function validRedesignModelPair(model: unknown, imageModel: unknown): boolean {
  if (imageModel === undefined || imageModel === null) return true;
  if (typeof imageModel !== "string" || !isVisibleImageModel(imageModel)) return false;
  const provider = model === undefined || model === null ? "openai" : String(model);
  return analysisProviderFor(imageModel) === provider;
}
