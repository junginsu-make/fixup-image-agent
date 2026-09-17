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

  it("**캔버스 밖까지 밀어내지 않는다**", () => {
    // 대각선 줄만 채운다. 빈 자리는 남아 있으므로 반드시 안쪽에서 찾아야 한다.
    const 대각선 = Array.from({ length: 15 }, (_, i) => ({ x: 52 + i * 24, y: 52 + i * 24 }));
    const 다음 = nextLayerOrigin(대각선, { x: 52, y: 52 });

    expect(다음.x).toBeLessThan(LEGACY_CANVAS_WIDTH - 60);
    expect(다음.x).toBeGreaterThanOrEqual(0);
    // 그리고 실제로 빈 자리여야 한다.
    expect(대각선.some((one) => Math.abs(one.x - 다음.x) < 8 && Math.abs(one.y - 다음.y) < 8)).toBe(false);
  });
});

/** 줄 나누기·주석 거르기. 정규식을 본문에 적으면 셸을 거치며 깨진다. */
const NEWLINE_RE = new RegExp(String.raw`?
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
