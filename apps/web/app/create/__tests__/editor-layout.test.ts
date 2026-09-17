import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alignedWidthFor, nextLayerOrigin, LEGACY_CANVAS_WIDTH } from "../layer-coords";

/**
 * 편집기에서 손대는 자리들. 셋 다 **캔버스 밖으로 나가거나 겹쳐** 사용자가
 * 고른 대로 안 보이던 것들이다.
 */
describe("B-6 — 줄맞춤을 바꿔도 캔버스를 안 벗어난다", () => {
  it("권장 폭이 캔버스 안이면 그대로 쓴다", () => {
    // 24px 글자 → 권장 240. 왼쪽 끝 52 에서 시작해도 292 라 460 안이다.
    expect(alignedWidthFor({ x: 52, width: 100, fontSize: 24 })).toBe(240);
  });

  it("**오른쪽으로 넘칠 만큼은 안 넓힌다**", () => {
    // 42px 글자의 권장 폭은 420. x=52 면 472 로 캔버스(460)를 넘는다.
    const 폭 = alignedWidthFor({ x: 52, width: 100, fontSize: 42 });

    expect(52 + 폭).toBeLessThanOrEqual(LEGACY_CANVAS_WIDTH);
  });

  it("이미 넓으면 줄이지 않는다 — 사용자가 정한 것이다", () => {
    expect(alignedWidthFor({ x: 0, width: 400, fontSize: 20 })).toBe(400);
  });

  it("오른쪽 끝에 붙어 있어도 최소한은 준다", () => {
    const 폭 = alignedWidthFor({ x: 450, width: 10, fontSize: 42 });

    expect(폭).toBeGreaterThan(0);
  });
});

describe("B-11 — 새 레이어가 겹쳐 쌓이지 않는다", () => {
  it("처음 것은 기본 자리다", () => {
    expect(nextLayerOrigin([], { x: 52, y: 52 })).toEqual({ x: 52, y: 52 });
  });

  it("**같은 자리에 이미 있으면 비켜 놓는다**", () => {
    const 다음 = nextLayerOrigin([{ x: 52, y: 52 }], { x: 52, y: 52 });

    expect(다음).not.toEqual({ x: 52, y: 52 });
  });

  it("여러 개가 쌓여도 계속 비켜 간다", () => {
    const 있는것 = [{ x: 52, y: 52 }, { x: 76, y: 76 }, { x: 100, y: 100 }];
    const 다음 = nextLayerOrigin(있는것, { x: 52, y: 52 });

    expect(있는것.some((one) => one.x === 다음.x && one.y === 다음.y)).toBe(false);
  });

  it("**상자가 캔버스 안에 들어간다** — 자리만 보면 오른쪽이 넘친다", () => {
    // 헤드라인 기본 폭이 360 이다. 자리만 460-60 으로 묶으면 끝이 760 이 된다.
    const 상자 = { width: 360, height: 120, canvasHeight: 613 };
    const 대각선 = Array.from({ length: 4 }, (_, i) => ({ x: 52 + i * 24, y: 52 + i * 24 }));
    const 다음 = nextLayerOrigin(대각선, { x: 52, y: 52 }, 상자);

    expect(다음.x + 상자.width).toBeLessThanOrEqual(LEGACY_CANVAS_WIDTH);
    expect(다음.y + 상자.height).toBeLessThanOrEqual(상자.canvasHeight);
  });

  it("**세로 한계는 캔버스 높이다** — 폭에서 온 값을 쓰면 아래로 새어 나간다", () => {
    // 1:1 은 높이가 460, 9:16 은 818 이다. 뜻이 전혀 다르다.
    const 정사각 = { width: 280, height: 100, canvasHeight: 460 };
    const 많이 = Array.from({ length: 20 }, (_, i) => ({ x: 52 + i * 24, y: 52 + i * 24 }));
    const 다음 = nextLayerOrigin(많이, { x: 52, y: 52 }, 정사각);

    expect(다음.y + 정사각.height).toBeLessThanOrEqual(정사각.canvasHeight);
  });

  it("빈 자리가 있으면 겹치지 않는 자리를 준다", () => {
    const 대각선 = Array.from({ length: 4 }, (_, i) => ({ x: 52 + i * 24, y: 52 + i * 24 }));
    const 다음 = nextLayerOrigin(대각선, { x: 52, y: 52 });

    expect(대각선.some((one) => Math.abs(one.x - 다음.x) < 8 && Math.abs(one.y - 다음.y) < 8)).toBe(false);
  });
});

/** 줄 나누기·주석 거르기. 정규식을 본문에 적으면 셸을 거치며 깨진다. */
const NEWLINE_RE = new RegExp(String.raw`
?
`);
const COMMENT_RE = new RegExp(String.raw`^\s*(\*|/\*|//|})`);

describe("배선", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");
  const gallery = readFileSync(new URL("../SectionGallery.tsx", import.meta.url), "utf8");

  it("줄맞춤이 새 계산을 쓴다", () => {
    expect(editor).toContain("alignedWidthFor(");
    expect(editor).not.toContain("clampValue(Math.round(overlay.fontSize * 10), 220, 520)");
  });

  it("새 레이어가 비켜 놓기를 쓴다", () => {
    expect([...editor.matchAll(/nextLayerOrigin\(/g)]).toHaveLength(2);
  });

  it("**B-5 — 확대 모달이 전역 뷰어를 또 열지 않는다**", () => {
    /*
      `data-zoomable` 이 있으면 전역 뷰어가 이 모달 위에 한 겹 더 열리고,
      두 keydown 이 함께 돌아 Esc 한 번에 둘 다 닫힌다.

      **모달 안의 큰 그림만 본다.** 주석은 빼고 본다 — 「붙이지 않는다」고
      적어 둔 설명이 검사에 걸리면 고쳐도 빨개진다.
    */
    const 코드 = gallery
      .split(NEWLINE_RE)
      .filter((line) => !COMMENT_RE.test(line))
      .join(String.fromCharCode(10));
    const 모달시작 = 코드.lastIndexOf("zoomSection.generatedImage");

    expect(코드.slice(모달시작 - 300, 모달시작 + 300)).not.toContain("data-zoomable");
  });

  it("B-8 — 앞 섹션을 지워도 보던 섹션을 따라간다", () => {
    expect(editor).toContain("index < current ? current - 1 : current");
  });
});

describe("화면이 상자 크기를 넘기는가", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");

  it("**두 곳 모두 상자와 캔버스 높이를 넘긴다** — 안 넘기면 기본값(460)으로 떨어진다", () => {
    expect([...editor.matchAll(/canvasHeight: canvasHeightFor\(aspectRatio\)/g)]).toHaveLength(2);
  });
});
