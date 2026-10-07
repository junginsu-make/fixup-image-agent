import { readFileSync } from "node:fs";
import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_MODEL } from "@fixup/pdp-core";
import { ModelPicker } from "../ModelPicker";

/**
 * **상세페이지 모델 고르기에 나노바나나 일반판(경제형)이 없다**(2026-10-07 사용자 지시).
 * 그 모델로 저장된 옛 작업은 기본 모델로 연다.
 */
describe("상세페이지 모델 고르기", () => {
  it("두 모델만, 실제 이름으로 보인다", () => {
    vi.stubGlobal("React", React);
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<ModelPicker value={DEFAULT_IMAGE_MODEL} sectionCount={3} onChange={() => {}} />); });
    const labels = renderer.root.findAllByType("strong").map((node) => String(node.props.children));
    // 2026-10-08 사용자 결정: 두 모델, 실제 이름으로.
    expect(labels).toEqual(["GPT Image 2.5", "Nano Banana Pro"]);
    act(() => renderer.unmount());
    vi.unstubAllGlobals();
  });

  it("글로 시작하기도 저장된 옛 모델을 기본 모델로 연다", () => {
    const flow = readFileSync(new URL("../TextModeFlow.tsx", import.meta.url), "utf8");
    expect(flow).toContain("pdpImageModelOrDefault(initialDraft?.imageModel)");
  });

  it("작업을 열 때(서버·브라우저 어느 저장이든) 모델을 두 모델 안으로 고친다", () => {
    const client = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");
    expect(client).toContain("setImageModel(pdpImageModelOrDefault(draft.imageModel));");
    expect(client).not.toContain("setImageModel(draft.imageModel ?? DEFAULT_IMAGE_MODEL);");
  });
});
