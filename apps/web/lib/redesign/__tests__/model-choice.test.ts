import { describe, expect, it } from "vitest";
import { analysisProviderFor, projectImageModel, redesignFalModelFor, requestImageModel } from "../model-choice";
import { redesignFalModelFor as 서버쪽 } from "../image-generator";
import { analysisProviderFor as 화면쪽 } from "../../../app/redesign/redesign-model";

/**
 * **리디자인도 세 모델 중에서 고른다. 분석 AI 는 그림 모델을 따른다**(2026-10-08 사용자 결정).
 *
 * 화면은 그림 모델(표준형·디테일형·속도형)을 고르고, 원본을 읽는 분석 AI 는
 * 그 모델의 계열을 따른다 — GPT 그림이면 OpenAI, 그 밖은 Google. 저장된 옛
 * 작업은 `imageModel` 없이 `model`(openai/google)만 들고 있어 지금처럼 읽는다.
 */
describe("분석 AI 는 그림 모델을 따른다", () => {
  it("분석 AI 는 그림 모델을 따른다", () => {
    expect(analysisProviderFor("gpt-image-2.5-flare")).toBe("openai");
    expect(analysisProviderFor("nano-banana-pro")).toBe("google");
    expect(analysisProviderFor("nano-banana-2.1")).toBe("google");
  });

  it("화면과 서버가 같은 하나를 쓴다", () => {
    expect(화면쪽).toBe(analysisProviderFor);
    expect(서버쪽).toBe(redesignFalModelFor);
  });
});

describe("실제로 그릴 모델", () => {
  it("옛 리디자인(google, imageModel 없음)은 디테일형으로 그린다", () => {
    expect(redesignFalModelFor("google")).toBe("nano-banana-pro");
    expect(redesignFalModelFor("google", "nano-banana-2.1")).toBe("nano-banana-2.1");
  });

  it("옛 리디자인(openai·없음)은 표준형으로 그린다", () => {
    expect(redesignFalModelFor("openai")).toBe("gpt-image-2.5-flare");
    expect(redesignFalModelFor(undefined)).toBe("gpt-image-2.5-flare");
  });

  /** 보이는 셋만 받는다. 숨긴 모델 id 가 오면 옛 규칙으로 떨어진다 — 서버는 그 전에 400 으로 막는다. */
  it("보이는 셋이 아니면 고른 값을 쓰지 않는다", () => {
    expect(redesignFalModelFor("openai", "gpt-image-2.5-sunburst")).toBe("gpt-image-2.5-flare");
    expect(redesignFalModelFor("google", "nano-banana")).toBe("nano-banana-pro");
  });
});

/**
 * **이어 그리기·고치기는 그 작업의 모델을 따른다**(2026-10-08 최종 리뷰 I3).
 *
 * 작업 공간에서 지금 고른 값이 아니라 작업이 그려진 모델이다. 옛 작업은
 * `model` 에서 읽고, 보이는 셋이 아니면 기본(표준형)으로.
 */
describe("작업의 그림 모델", () => {
  it("작업이 들고 있는 모델을 쓴다", () => {
    expect(projectImageModel({ model: "google", imageModel: "nano-banana-2.1" })).toBe("nano-banana-2.1");
    expect(projectImageModel({ model: "openai", imageModel: "gpt-image-2.5-flare" })).toBe("gpt-image-2.5-flare");
  });

  it("옛 작업은 model 에서 읽는다", () => {
    expect(projectImageModel({ model: "google" })).toBe("nano-banana-pro");
    expect(projectImageModel({ model: "openai" })).toBe("gpt-image-2.5-flare");
  });

  it("숨긴·모르는 모델이면 보이는 기본으로", () => {
    expect(projectImageModel({ model: "openai", imageModel: "gpt-image-2.5-sunburst" })).toBe("gpt-image-2.5-flare");
    expect(projectImageModel({ model: "x", imageModel: "y" })).toBe("gpt-image-2.5-flare");
  });
});

describe("이 요청이 쓸 그림 모델", () => {
  it("새로 만들면 고른 값", () => {
    expect(requestImageModel("nano-banana-2.1")).toBe("nano-banana-2.1");
    expect(requestImageModel("nano-banana-pro", null)).toBe("nano-banana-pro");
  });

  it("**이어 그리면 작업의 모델 — 지금 고른 값이 아니다**", () => {
    const 작업 = { model: "google", imageModel: "nano-banana-2.1" };
    expect(requestImageModel("gpt-image-2.5-flare", 작업)).toBe("nano-banana-2.1");
    expect(analysisProviderFor(requestImageModel("gpt-image-2.5-flare", 작업))).toBe("google");
    expect(requestImageModel("nano-banana-2.1", { model: "openai" })).toBe("gpt-image-2.5-flare");
  });
});
