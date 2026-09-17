import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 「내 카드뉴스 만들기」가 **한 화면에 들어가게 하는 줄들**(2026-09-17 사용자 요청).
 *
 * 크기 규칙은 `fit-screen.test.ts` 가 값으로 잰다. 여기서는 화면이 그 규칙을
 * 실제로 쓰는지 본다. 이 저장소에는 jsdom 이 없어 그려서 볼 수 없다 — 대신
 * 로컬 화면 네 크기(2000×1026 · 1536×730 · 1366×657 · 1280×650)에서 페이지
 * 스크롤 없음, 「칸 읽어내기」 버튼이 창 안, 네 열 모두 넘침 없음을 쟀다.
 */
const client = readFileSync(new URL("../layout-client.tsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../slot-canvas.tsx", import.meta.url), "utf8");
const shell = readFileSync(
  new URL("../../../../../../packages/ui/src/components/app-shell.tsx", import.meta.url), "utf8",
);

describe("작업 영역 높이", () => {
  it("**어림값을 안 쓴다** — 위가 두꺼워지면 아래로 넘쳐 버튼이 잘렸다", () => {
    expect(client).not.toContain("h-[calc(100vh-9rem)]");
  });

  it("실제로 남은 높이를 재서 준다", () => {
    expect(client).toContain("const fit = useFitScreen();");
    expect(client).toContain('ref={fit.rootRef} className="flex flex-col gap-3" style={{ height: fit.rootHeight }}');
  });
});

describe("카드 칸", () => {
  it("왼쪽 열에서 아래 묶음을 뺀 자리에 맞춰 줄어든다", () => {
    expect(client).toContain("ref={fit.columnRef}");
    expect(client).toContain("ref={fit.belowRef}");
    expect(client).toContain("space={fit.canvasSpace}");
    expect(canvas).toContain("canvasSize(size, space)");
  });

  it("크기 규칙을 한 곳에서 가져온다 — 두 벌이면 한쪽만 고쳐진다", () => {
    expect(canvas).toContain('import { canvasSize } from "./fit-screen";');
    expect(canvas).not.toContain("export function canvasSize");
  });
});

describe("열 폭", () => {
  it("**첫 열에 바닥이 있다** — 없으면 좁은 화면에서 짜부라져 설정 묶음이 세로로 길어졌다", () => {
    expect(client).toContain("lg:grid-cols-[minmax(17rem,max-content)_");
  });

  it("선택 상자가 칸 폭을 안 넘는다 — 넘으면 왼쪽 열에 가로 스크롤이 생겼다", () => {
    expect(client).toContain('const BAR_SELECT = "h-9 w-full min-w-0');
    expect(client.split('className="grid min-w-0 gap-1"').length - 1).toBe(2);
  });
});

describe("사이드바", () => {
  it("**자기 안에서만 스크롤한다** — 메뉴가 길면 페이지 전체에 스크롤을 만들었다", () => {
    expect(shell).toMatch(/"sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto /);
  });
});
