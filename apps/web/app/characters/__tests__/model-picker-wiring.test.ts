import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** 캐릭터 화면의 모델 고르기는 공용 부품 + pdp-core 표를 쓴다(Task 7). */
const studio = readFileSync(new URL("../CharacterStudio.tsx", import.meta.url), "utf8");

describe("캐릭터 모델 고르기 연결", () => {
  it("손으로 적은 표 대신 selectCharacterModel 을 쓴다", () => {
    expect(studio).not.toContain("MODEL_BY_LOOK");
    expect(studio).toContain("selectCharacterModel(look)");
  });

  it("공용 ImageModelPicker 에 auto 선택지를 넘기고 시험 표시는 없다", () => {
    expect(studio).toContain("<ImageModelPicker");
    expect(studio).toContain("auto={{");
    expect(studio).not.toContain("untested");
    expect(studio).not.toContain("시험");
  });

  it("자동 안내의 조사는 withJosa 로 고른다", () => {
    expect(studio).toContain('withJosa(imageModelName(autoModel), "으로로")');
  });

  it("숨긴 모델로 저장된 캐릭터를 열면 칸은 자동으로 시작한다", () => {
    const at = studio.indexOf("const prefillOpened = useCallback(");
    const body = studio.slice(at, studio.indexOf("}, []);", at));
    expect(body).toContain("isVisibleImageModel(values.modelId)");
  });
});
