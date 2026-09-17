import { describe, expect, it } from "vitest";
import { anchorWorkbenchToOverlay } from "../pdp-canvas-utils";

/**
 * **작업대가 레이어 옆에 붙어야 한다.**
 *
 * 레이어 좌표는 이제 **축소 전 460 좌표계**다(B-1). 그런데 작업대는 무대의
 * **보이는** 좌표계에 놓인다. 축소 배율을 안 넘기면, 좁은 화면에서 x=400 에 놓은
 * 레이어는 화면상 260 쯤에 보이는데 작업대는 400+ 자리에 붙는다 — 「레이어에
 * 붙이기」가 레이어에서 한참 떨어진 곳을 가리킨다.
 */
const 무대 = { clientWidth: 1240, clientHeight: 720 } as HTMLDivElement;
const 캔버스 = { offsetLeft: 100, offsetTop: 50 } as HTMLDivElement;
const 작업대 = { width: 300, height: 200 } as never;
const 레이어 = { id: "t1", kind: "text", x: 400, y: 200, width: 120, height: 40 } as never;

describe("축소된 화면에서", () => {
  it("배율을 안 주면 지금까지와 같다", () => {
    const 자리 = anchorWorkbenchToOverlay(레이어, 캔버스, 무대, 작업대);

    expect(자리.x).toBe(100 + 400 + 120 + 18);
  });

  it("**배율을 주면 보이는 자리에 붙는다**", () => {
    const 자리 = anchorWorkbenchToOverlay(레이어, 캔버스, 무대, 작업대, 0.5);

    // 화면상 레이어는 100 + 400*0.5 = 300 에 있고, 폭은 60 이다.
    expect(자리.x).toBe(100 + 200 + 60 + 18);
  });

  it("세로도 함께 줄인다", () => {
    const 자리 = anchorWorkbenchToOverlay(레이어, 캔버스, 무대, 작업대, 0.5);

    expect(자리.y).toBe(50 + 100);
  });

  it("무대 밖으로는 안 나간다", () => {
    const 자리 = anchorWorkbenchToOverlay(레이어, 캔버스, 무대, 작업대, 0.5);

    expect(자리.x).toBeGreaterThanOrEqual(12);
    expect(자리.y).toBeGreaterThanOrEqual(12);
  });
});
