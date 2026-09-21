import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGACY_CANVAS_WIDTH, canvasFitFor } from "../layer-coords";

/**
 * **이 저장소는 460px 고정 좌표계다.**
 *
 * 레이어 좌표가 캔버스 CSS 픽셀 절대값인데 캔버스가 화면 따라 줄면, 데스크톱
 * 에서 오른쪽에 붙인 글자가 휴대폰에서 **잘린 채 구워진다.** 그래서 안쪽 폭을
 * 460 으로 못 박고 겉껍데기만 줄인다.
 *
 * 비율 변환 함수는 두지 않는다 — 한때 만들어 뒀다가 아무도 안 불러서 지웠다.
 * 안 쓰는 모듈이 초록이면 다음 사람이 「정규화돼 있다」고 잘못 읽는다.
 */
describe("겉을 줄이는 배율", () => {
  it("넓으면 줄이지 않는다", () => {
    expect(canvasFitFor(600)).toBe(1);
    expect(canvasFitFor(460)).toBe(1);
  });

  it("좁으면 그만큼 줄인다", () => {
    expect(canvasFitFor(300)).toBeCloseTo(300 / 460);
  });

  it("**아직 안 붙었으면 줄이지 않는다** — 0 을 곱하면 화면이 사라진다", () => {
    expect(canvasFitFor(0)).toBe(1);
    expect(canvasFitFor(undefined)).toBe(1);
  });
});

/**
 * **배선이 실제로 닿았는가.**
 *
 * 배율 계산이 맞아도 화면이 안 쓰면 아무 일도 안 일어난다. 그 줄들은 지워도
 * 위 시험이 전부 통과한다.
 */
describe("화면이 실제로 쓰는가", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../pdp-maker.module.css", import.meta.url), "utf8");

  it("**안쪽 캔버스 폭이 고정이다** — 화면 따라 줄면 좌표의 뜻이 달라진다", () => {
    const 캔버스 = /\.imageCanvas\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(캔버스).toContain("width: 460px");
    expect(캔버스).not.toContain("min(100%");
  });

  it("겉껍데기가 좁은 화면을 맡는다", () => {
    expect(css).toContain(".imageCanvasFit");
    expect(/\.imageCanvasFit\s*\{[^}]*\}/.exec(css)?.[0]).toContain("min(100%, 460px)");
  });

  it("**창 크기 변화를 본다** — 전에는 감지가 한 건도 없었다", () => {
    expect(editor).toContain("new ResizeObserver");
    expect(editor).toContain("setCanvasFit(canvasFitFor(");
  });

  it("**붙는 순간에 관찰을 시작한다** — effect 로 하면 갤러리↔편집 전환을 놓친다", () => {
    // 2026-09-17 실제 브라우저로 확인한 결함이다. effect 의 딸림값이 안 바뀌어
    // 편집 화면에 들어와도 관찰자가 한 번도 안 붙었다.
    expect(editor).toContain("const attachCanvasFit = useCallback(");
    expect(editor).toContain("ref={attachCanvasFit}");
  });

  it("**끌 때도 배율을 반영한다** — 안 하면 잡은 자리와 실제가 어긋난다", () => {
    expect(editor).toContain("scale={canvasFit}");
  });

  it("관찰자를 치운다 — 섹션을 옮길 때마다 쌓이면 안 된다", () => {
    expect(editor).toContain("fitObserverRef.current?.disconnect()");
    expect(editor).toContain("heightObserverRef.current?.disconnect()");
  });
});

/**
 * **460 이 서로 모르는 네 곳에 흩어져 있다.**
 *
 * CSS 의 `.imageCanvas{width}`·`.imageCanvasFit{width}`, TS 의
 * `LEGACY_CANVAS_WIDTH`, 그리고 내보내기의 기본 폭. 하나만 고치면 좁은 화면에서
 * 축소가 모자라 캔버스가 삐져나가고 저장된 레이어가 전부 밀린다.
 *
 * `canvasFitFor(460) === 1` 같은 검사는 **같은 상수를 자기 자신과 대조**하는
 * 것이라 빨개지지 않는다. 실제 파일을 읽어 대조한다 — `editor-fonts.test.ts` 가
 * `pretendard.css` 를 읽는 것과 같은 수법이다.
 */
describe("기준 폭이 한 값인가", () => {
  const css = readFileSync(new URL("../pdp-maker.module.css", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");

  const 폭 = (선택자: string) => {
    const 블록 = new RegExp(String.raw`\.${선택자}\s*\{([^}]*)\}`).exec(css)?.[1] ?? "";
    return Number(/width:[^;]*?(\d+)px/.exec(블록)?.[1]);
  };

  it("CSS 의 안쪽 캔버스 폭과 코드의 기준이 같다", () => {
    expect(폭("imageCanvas")).toBe(LEGACY_CANVAS_WIDTH);
  });

  it("겉껍데기 상한도 같다", () => {
    expect(폭("imageCanvasFit")).toBe(LEGACY_CANVAS_WIDTH);
  });

  it("**내보내기의 마지막 기본값도 같다** — 다르면 그때만 좌표가 어긋난다", () => {
    const 기본값 = /lastCanvasWidthRef\.current \|\| (\d+)/.exec(editor)?.[1];
    expect(Number(기본값)).toBe(LEGACY_CANVAS_WIDTH);
  });
});
