import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { previewFitFor } from "../layer-coords";

/**
 * **갤러리와 이어보기가 얹은 글자를 보여 줘야 한다.**
 *
 * 지금은 `generatedImage` 원본만 그린다. 이어보기 옆에는 「실제 상세페이지처럼
 * 위에서 아래로 이어 붙인 모습입니다」라고 적혀 있는데, 정작 **얹은 글자가 하나도
 * 안 보인다.** 사용자는 최종 모습을 확인하려고 그 화면을 여는데 확인이 안 된다.
 *
 * 레이어 좌표가 460 기준으로 고정됐으므로(B-1), 보여 줄 폭에 맞춰 **배율만
 * 곱하면** 같은 자리에 그릴 수 있다. 다시 굽지 않아도 된다.
 */
describe("미리보기 배율", () => {
  it("보여 줄 폭에 맞춰 줄인다", () => {
    expect(previewFitFor(230)).toBeCloseTo(0.5);
    expect(previewFitFor(420)).toBeCloseTo(420 / 460);
  });

  it("**넓게 보여 줄 때는 키운다** — 이어보기가 460 보다 넓을 수 있다", () => {
    expect(previewFitFor(920)).toBeCloseTo(2);
  });

  it("폭을 모르면 1 이다 — 0 을 곱하면 사라진다", () => {
    expect(previewFitFor(0)).toBe(1);
    expect(previewFitFor(undefined)).toBe(1);
  });
});

describe("화면이 실제로 그리는가", () => {
  const gallery = readFileSync(new URL("../SectionGallery.tsx", import.meta.url), "utf8");

  it("**격자와 이어보기 두 곳 모두 얹는다** — 한 곳만 고치면 화면마다 달라진다", () => {
    // 이어보기 옆에는 「최종 모습 그대로」라고 적혀 있다. 그 약속을 지켜야 한다.
    const 쓰인횟수 = [...gallery.matchAll(/<SectionPreview/g)].length;
    expect(쓰인횟수).toBe(2);
  });

  it("원본만 그리던 자리가 남아 있지 않다", () => {
    // `<img ... src={section.generatedImage}` 가 남아 있으면 그 자리는 안 고쳐진 것이다.
    expect(gallery).not.toMatch(/<img[^>]*src=\{section\.generatedImage\}/);
  });

  it("레이어를 실제로 받는다 — 개수만 받으면 그릴 수 없다", () => {
    expect(gallery).toContain("overlaysBySection");
  });

  it("**편집기와 같은 스타일 함수를 쓴다** — 따로 지으면 화면마다 달라진다", () => {
    const preview = readFileSync(new URL("../SectionPreview.tsx", import.meta.url), "utf8");
    expect(preview).toContain("buildOverlayShellStyle");
    expect(preview).toContain("buildOverlayTextStyle");
    expect(preview).toContain("buildShapeLayerStyle");
  });
});
