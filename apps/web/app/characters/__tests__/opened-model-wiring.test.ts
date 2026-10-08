import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** 「과정 보기」로 연 캐릭터가 원래 모델을 칸과 고른 정면에 함께 채운다(2026-10-07 사용자 결정). */
const studio = readFileSync(new URL("../CharacterStudio.tsx", import.meta.url), "utf8");
const notice = readFileSync(new URL("../opened-notice.tsx", import.meta.url), "utf8");

describe("과정 보기 — 모델 이어받기", () => {
  it("모델 칸과 고른 정면에 원래 모델을 넣는다", () => {
    const at = studio.indexOf("const prefillOpened = useCallback(");
    expect(at).toBeGreaterThan(-1);
    const body = studio.slice(at, studio.indexOf("}, []);", at));
    expect(body).toContain("setModelId(isVisibleImageModel(values.modelId) ? values.modelId : \"\")");
    expect(body).toContain("modelId: values.modelId");
  });

  it("안내가 「모델은 저장되지 않았다」고 말하지 않는다", () => {
    expect(notice).not.toContain("고른 모델은 저장되지 않아");
    expect(notice).toContain("참고 그림은 저장되지 않아");
  });
});
