import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEGACY_CANVAS_WIDTH,
  toCanvasLayer,
  toStoredLayer,
  canvasFitFor,
  type StoredGeometry,
} from "../layer-coords";

/**
 * **레이어가 어느 화면에서 봐도 같은 자리에 있어야 한다.**
 *
 * 레이어 좌표가 캔버스 CSS 픽셀 절대값이고, 캔버스는 `min(100%, 460px)` 이라
 * 창이 좁으면 함께 줄어든다. 데스크톱(460px)에서 오른쪽에 붙여 배치한 글자가
 * 휴대폰(300px)에서는 **캔버스 밖으로 나가 잘린다.** 저장해 뒀다가 다른
 * 기기에서 열면 그대로 드러난다.
 *
 * 설계 §11: 「문서 좌표계를 원본 이미지 픽셀 또는 정규화 좌표로 고정한다.
 * 화면 크기는 viewport scale 일 뿐 저장 좌표가 아니다.」
 *
 * 그래서 **저장은 비율(0~1)로, 화면은 지금 폭을 곱해서** 쓴다.
 */
const 데스크톱 = 460;
const 휴대폰 = 300;

describe("저장 — 지금 폭으로 나눈다", () => {
  it("캔버스 폭의 비율로 적는다", () => {
    const 저장본 = toStoredLayer(
      { x: 230, y: 115, width: 184, height: 46, fontSize: 42 },
      데스크톱,
    );

    expect(저장본.xRatio).toBeCloseTo(0.5);
    expect(저장본.yRatio).toBeCloseTo(0.25);
    expect(저장본.widthRatio).toBeCloseTo(0.4);
  });

  it("**글자 크기도 비율이다** — 안 그러면 좁은 화면에서만 글자가 커 보인다", () => {
    const 저장본 = toStoredLayer({ x: 0, y: 0, width: 100, height: 40, fontSize: 46 }, 데스크톱);

    expect(저장본.fontSizeRatio).toBeCloseTo(0.1);
  });

  it("퍼센트로 적힌 폭은 그대로 비율이 된다", () => {
    const 저장본 = toStoredLayer({ x: 0, y: 0, width: "50%", height: 40, fontSize: 20 }, 데스크톱);

    expect(저장본.widthRatio).toBeCloseTo(0.5);
  });
});

describe("표시 — 지금 폭을 곱한다", () => {
  const 저장본: StoredGeometry = {
    xRatio: 0.5, yRatio: 0.25, widthRatio: 0.4, heightRatio: 0.1, fontSizeRatio: 0.0913,
  };

  it("데스크톱에서는 원래 자리다", () => {
    const 화면 = toCanvasLayer(저장본, 데스크톱);

    expect(화면.x).toBeCloseTo(230);
    expect(화면.width).toBeCloseTo(184);
  });

  it("**좁은 화면에서도 같은 비율 자리다** — 밖으로 안 나간다", () => {
    const 화면 = toCanvasLayer(저장본, 휴대폰);

    expect(화면.x).toBeCloseTo(150);
    expect(화면.width).toBeCloseTo(120);
    // 오른쪽 끝이 캔버스 안이다.
    expect(화면.x + 화면.width).toBeLessThanOrEqual(휴대폰);
  });

  it("글자 크기도 함께 줄어든다", () => {
    const 좁게 = toCanvasLayer(저장본, 휴대폰);
    const 넓게 = toCanvasLayer(저장본, 데스크톱);

    expect(좁게.fontSize).toBeLessThan(넓게.fontSize);
    expect(좁게.fontSize / 넓게.fontSize).toBeCloseTo(휴대폰 / 데스크톱);
  });

  it("**왕복해도 값이 안 변한다**", () => {
    const 처음 = { x: 52, y: 52, width: 336, height: 120, fontSize: 42 };
    const 돌아온것 = toCanvasLayer(toStoredLayer(처음, 데스크톱), 데스크톱);

    expect(돌아온것.x).toBeCloseTo(처음.x);
    expect(돌아온것.width).toBeCloseTo(처음.width);
    expect(돌아온것.fontSize).toBeCloseTo(처음.fontSize);
  });
});

describe("옛 레이어 — 비율이 없던 시절", () => {
  it("**460px 에서 놓은 것으로 읽는다**(설계 §5.1)", () => {
    // 비율 칸이 없으면 옛 저장본이다. 그때 기준 폭은 460 이었다.
    const 화면 = toCanvasLayer({ x: 230, y: 115, width: 184, height: 46, fontSize: 42 } as never, 데스크톱);

    expect(화면.x).toBeCloseTo(230);
    expect(화면.width).toBeCloseTo(184);
  });

  it("옛 레이어도 좁은 화면에서는 줄여 보여 준다", () => {
    const 화면 = toCanvasLayer({ x: 230, y: 0, width: 184, height: 46, fontSize: 42 } as never, 휴대폰);

    expect(화면.x).toBeCloseTo(230 * (휴대폰 / LEGACY_CANVAS_WIDTH));
  });

  it("기준 폭은 460 이다", () => {
    expect(LEGACY_CANVAS_WIDTH).toBe(460);
  });
});

describe("캔버스 밖으로 못 나간다", () => {
  it("오른쪽으로 밀어도 안에 머문다", () => {
    const 화면 = toCanvasLayer(
      { xRatio: 0.95, yRatio: 0, widthRatio: 0.4, heightRatio: 0.1, fontSizeRatio: 0.05 },
      데스크톱,
    );

    expect(화면.x + 화면.width).toBeLessThanOrEqual(데스크톱);
  });

  it("음수 자리는 0 으로 당긴다", () => {
    const 화면 = toCanvasLayer(
      { xRatio: -0.2, yRatio: -0.1, widthRatio: 0.4, heightRatio: 0.1, fontSizeRatio: 0.05 },
      데스크톱,
    );

    expect(화면.x).toBe(0);
    expect(화면.y).toBe(0);
  });
});

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
