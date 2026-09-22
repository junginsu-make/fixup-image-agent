import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DraftSaveClock, draftChangeValues } from "../draft-save-clock";
import { previewedLayer, type LayerPreview } from "../layer-preview";

/**
 * **드래그 한 프레임마다 부모까지 다시 그렸다**(B-12-c).
 *
 * 설계 §14.4: 「drag마다 부모 전체 rerender | **성능 계측 후 임시
 * state/commit 분리** | W6/W8 / **드래그 응답과 저장 수**」.
 *
 * 레이어를 끌면 `onDrag` 가 프레임마다 `updateOverlay` 를 불렀다. 그러면
 *
 *   1. `setOverlaysBySection` → 편집기가 다시 그린다
 *   2. 그 값이 `onDraftStateChange` 로 올라가 **부모(`PdpMakerClient`)가 다시
 *      그린다** 2,000줄짜리 화면이다
 *   3. 부모가 초안 전체를 다시 조립해 저장 시계에 넣는다 → **프레임마다 수정**
 *
 * 실측(2026-09-21, 1초 드래그 = 60프레임, W8 대표 초안):
 *
 *   저장 시계 수정 횟수   **61회** → 고친 뒤 **2회**
 *   시계가 하는 일         2.8ms (프레임당 0.05ms)
 *
 * **JS 일 자체는 싸다.** 값을 내는 것은 부모 트리를 60번 다시 그리는 쪽이고,
 * 그것은 브라우저 없이 못 쟀다(`w8-measurements.md` 에 적었다).
 *
 * 고치는 방법은 설계가 말한 그대로다 — 끄는 동안은 **임시 자리**에 두고,
 * 놓을 때 한 번 **확정**한다.
 */

const 레이어 = { id: "a", x: 10, y: 20, width: 320, height: 92, fontSize: 32 };

describe("끄는 동안은 임시 자리를 보여 준다", () => {
  it("**끌고 있는 레이어는 임시 자리로 보인다**", () => {
    const 미리보기: LayerPreview = { id: "a", x: 100, y: 200 };

    expect(previewedLayer(레이어, 미리보기)).toMatchObject({ x: 100, y: 200 });
  });

  it("**다른 레이어는 제자리다**", () => {
    const 미리보기: LayerPreview = { id: "b", x: 100, y: 200 };

    expect(previewedLayer(레이어, 미리보기)).toMatchObject({ x: 10, y: 20 });
  });

  it("**끄는 중이 아니면 제자리다**", () => {
    expect(previewedLayer(레이어, null)).toMatchObject({ x: 10, y: 20 });
  });

  it("**같은 객체를 돌려준다** — 바뀐 것이 없으면 새로 만들지 않는다", () => {
    expect(previewedLayer(레이어, null)).toBe(레이어);
    expect(previewedLayer(레이어, { id: "b", x: 1, y: 2 })).toBe(레이어);
  });

  /**
   * **크기를 바꾸는 중에도 같다.** 크기 조절도 프레임마다 확정하고 있었다 —
   * 같은 기계다.
   */
  it("**크기와 글자 크기도 임시로 보인다**", () => {
    const 미리보기: LayerPreview = { id: "a", x: 10, y: 20, width: 500, height: 200, fontSize: 48 };

    expect(previewedLayer(레이어, 미리보기)).toMatchObject({ width: 500, height: 200, fontSize: 48 });
  });

  it("**임시로 안 준 값은 원래 것을 지킨다**", () => {
    const 미리보기: LayerPreview = { id: "a", x: 100, y: 200 };

    expect(previewedLayer(레이어, 미리보기)).toMatchObject({ width: 320, height: 92, fontSize: 32 });
  });

  it("**원래 레이어를 고치지 않는다**", () => {
    previewedLayer(레이어, { id: "a", x: 999, y: 999 });

    expect(레이어.x).toBe(10);
  });
});

/**
 * **저장 시계가 프레임마다 움직이면 안 된다.**
 *
 * 이것이 설계가 말한 「저장 수」다. 1초 드래그에 61회였다.
 */
describe("저장 수", () => {
  const 초안 = (x: number) => ({
    id: "d1",
    sellerBrief: "가",
    editorState: { overlaysBySection: { s0: [{ id: "a", x, y: 20 }] } },
  });

  it("**프레임마다 확정하면 프레임마다 수정으로 잡힌다** — 고치기 전 모습", () => {
    const clock = new DraftSaveClock();
    clock.observe(draftChangeValues(초안(0)));

    for (let frame = 1; frame <= 60; frame += 1) clock.observe(draftChangeValues(초안(frame)));

    expect(clock.revision).toBe(61);
  });

  it("**놓을 때 한 번만 확정하면 한 번이다**", () => {
    const clock = new DraftSaveClock();
    clock.observe(draftChangeValues(초안(0)));

    clock.observe(draftChangeValues(초안(60)));

    expect(clock.revision).toBe(2);
  });
});

/**
 * **조립기를 만들어 두고 화면이 안 쓰면 아무것도 안 고친 것이다**(X-07 의 교훈).
 *
 * 편집기는 렌더 시험 틀이 없다(react-rnd·캔버스). **글로 잠근다** — 다른
 * 방법이 없어서이지 이것이 더 나아서가 아니다.
 */
describe("편집기가 그 조립기를 쓴다", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("**끄는 동안은 확정하지 않는다**", () => {
    // onDrag 가 updateOverlay 로 가면 프레임마다 부모가 다시 그린다.
    expect(editor).not.toMatch(/onDrag=\{\(_, data\) => handleOverlayDrag/);
  });

  it("**끄는 동안은 임시 자리에 담는다**", () => {
    expect(editor).toMatch(/onDrag=\{\(_, data\) => setLayerPreview/);
  });

  it("**놓을 때 확정한다**", () => {
    expect(editor).toMatch(/onDragStop=\{\(_, data\) => \{[\s\S]{0,200}handleOverlayDrag/);
  });

  it("**놓으면 임시 자리를 비운다** — 안 비우면 다음 렌더가 옛 자리로 되돌린다", () => {
    const 놓는자리 = editor.slice(editor.indexOf("onDragStop={(_, data) => {"));

    expect(놓는자리.slice(0, 300)).toContain("setLayerPreview(null)");
  });

  /**
   * **한 줄만 보면 줄바꿈으로 빠져나간다.** 처음 시험은 `onResize={… => handleResize`
   * 를 한 줄짜리 정규식으로 막았는데, 같은 호출을 두 줄로 쓰면 지나갔다
   * (2026-09-21 변이에서 드러남). **무엇을 부르는지**를 본다.
   */
  it("**크기 조절도 놓을 때 확정한다**", () => {
    const 조절자리 = editor.slice(editor.indexOf("onResize={"));

    expect(조절자리.slice(0, 260)).toContain("setLayerPreview(previewResize(");
    expect(조절자리.slice(0, 260)).not.toContain("handleResize(");
  });

  it("**크기 조절을 놓아도 임시 자리를 비운다**", () => {
    const 놓는자리 = editor.slice(editor.indexOf("onResizeStop={"));

    expect(놓는자리.slice(0, 320)).toContain("setLayerPreview(null)");
  });

  /**
   * **`previewedLayer(` 가 소스 어딘가에 있는지만 보면 모자라다.**
   *
   * 선언만 남기고 Rnd 가 `layer.x` 를 도로 읽게 바꿔도 통과한다
   * (2026-09-21 리뷰). **무엇을 그리는 데 쓰는지**를 본다.
   */
  it("**보이는 값은 조립기를 거친다**", () => {
    expect(editor).toContain("const overlay = previewedLayer(layer, layerPreview);");
  });

  it("**Rnd 가 조립기를 거친 값으로 그린다**", () => {
    expect(editor).toContain("position={{ x: overlay.x, y: overlay.y }}");
    expect(editor).toContain("size={{ width: overlay.width, height: overlay.height }}");
  });

  /**
   * **옆 숫자도 같이 움직여야 한다.** 캔버스 글자는 실시간으로 커지는데
   * 작업대의 「폭」·「크기」만 멈춰 있다가 튀면 같은 화면에 두 값이 어긋난다.
   */
  it("**작업대가 읽는 값도 조립기를 거친다**", () => {
    expect(editor).toContain("previewedLayer(committedLayer, layerPreview)");
  });

  /** **확정은 언제나 `layer`.** 임시 객체를 확정하면 안 된다. */
  it("**놓을 때 확정하는 것은 임시 객체가 아니다**", () => {
    const 놓는자리 = editor.slice(editor.indexOf("onDragStop={(_, data) => {"));

    expect(놓는자리.slice(0, 300)).toContain("handleOverlayDrag(layer,");
    expect(놓는자리.slice(0, 300)).not.toContain("handleOverlayDrag(overlay,");
  });
});
