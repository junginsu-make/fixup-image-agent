import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 화면 배선을 소스로 지킨다.
 *
 * `PdpEditor` 는 2,600줄짜리 클라이언트 컴포넌트라 통째로 띄우는 시험이 비싸다.
 * 여기서 보는 것은 **되돌아가면 사고가 나는 몇 줄**이다 — 실제로 다섯 가지가
 * 조용히 어긋나 있었다.
 */
const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");
const gallery = readFileSync(new URL("../SectionGallery.tsx", import.meta.url), "utf8");
const maker = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");
const drafts = readFileSync(new URL("../pdp-drafts.ts", import.meta.url), "utf8");

describe("배치 생성 결과가 제 섹션에 붙는가", () => {
  it("자리 차례로 되돌린다 — `section_id` 로 묶지 않는다", () => {
    // `section_id` 는 AI 응답값이라 겹칠 수 있다. 겹치면 두 섹션이 같은 그림을
    // 받고, 이번에 만들지도 않은 섹션의 기존 이미지가 덮여 사라진다.
    expect(editor).not.toContain("new Map(response.results.map((item) => [item.sectionId, item]))");
    expect(editor).toContain("const key = sectionKeys[index];");
    expect(editor).toContain("const outcome = response.results[position];");
  });

  it("강조어도 자리 차례로 보낸다", () => {
    expect(editor).toContain("emphasisWordsList:");
    expect(editor).not.toContain("emphasisWordsBySection:");
  });
});

describe("도는 동안 갤러리를 잠그는가", () => {
  it("배치도 생성 중 열쇠를 채운다", () => {
    // 안 채우면 5분짜리 배치가 도는 동안 삭제·순서 변경이 열려 있고, 도중에
    // 섹션을 지우면 이미 과금된 그림이 조용히 버려진다.
    expect(editor).toContain("const targetKeys = targets");
    expect(editor).toMatch(/setGeneratingKeys\(\(current\) => \[\s*\.\.\.current,\s*\.\.\.targetKeys/);
  });

  it("끝나면 반드시 푼다", () => {
    expect(editor).toContain("setGeneratingKeys((current) => current.filter((key) => !targetKeys.includes(key)));");
  });
});

describe("차감 장수를 서버와 같은 식으로 세는가", () => {
  it("없어진 정수 가중치를 안 쓴다", () => {
    // 서버는 실제 단가에서 장을 뽑는다. 화면이 가중치를 곱하면 gpt-image-2
    // 여섯 장에 서버 27장 · 화면 24장으로 갈린다.
    expect(editor).not.toContain("IMAGE_MODEL_CREDIT_WEIGHT");
    expect(gallery).not.toContain("IMAGE_MODEL_CREDIT_WEIGHT");
    expect(editor).toContain("imageCreditUnits(imageModel,");
    expect(gallery).toContain("imageCreditUnits(imageModel, missingCount)");
  });
});

describe("사진 경로의 이미지 방향이 생성까지 가는가", () => {
  it("확정할 때 한국어 방향을 prompt_en 에 싣는다", () => {
    // 시나리오 화면의 「이미지 방향」은 prompt_ko 만 고치는데 생성은 prompt_en
    // 만 본다. 글 경로만 이 일을 하고 있었다.
    expect(maker).toContain("mergeArtDirection(analyzedBlueprint, result.blueprint)");
    expect(maker).toContain("setAnalyzedBlueprint(response.result.blueprint);");
  });
});

describe("초안을 다시 열 때", () => {
  it("심사 결과를 버리지 않는다", () => {
    expect(drafts).toContain("...(result.review ? { review: result.review } : {})");
    expect(maker).toContain("setReview(draft.result?.review);");
  });

  it("시나리오 단계로도 돌아간다", () => {
    expect(drafts).toContain('record.appState === "scenario" || record.appState === "editor"');
    expect(maker).toContain('setAppState(draft.result ? draft.appState : "upload");');
  });
});
