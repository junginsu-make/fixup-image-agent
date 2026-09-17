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
    expect(client).toContain('ref={fit.rootRef} className="flex min-w-0 flex-col gap-3" style={{ height: fit.rootHeight }}');
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
    expect(client).toContain("lg:grid-cols-[var(--first-column)_minmax(11rem,15rem)_minmax(14rem,22rem)_minmax(15rem,1fr)]");
    expect(client).toContain("max(17rem, ${canvasSize(ratio.pixel, fit.canvasSpace).width}px)");
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

describe("레퍼런스 열 제목", () => {
  it("짧게 「레퍼런스」라고만 쓴다 — 무엇을 하는지는 아래 버튼이 말한다", () => {
    expect(client).toContain("<h3 className=\"font-semibold\">레퍼런스</h3>");
    expect(client).not.toContain("레퍼런스에서 칸 읽어내기");
    expect(client).toContain("\"칸 읽어내기\"");
  });
});

/**
 * **재는 코드를 잠근다**(2026-09-17 독립 리뷰: 이 파일을 아무도 안 읽어, 좁은 화면
 * 가드를 풀거나 지켜보기를 빼거나 아래 여백을 0 으로 해도 초록이었다).
 */
describe("재는 코드", () => {
  const hook = readFileSync(new URL("../use-fit-screen.ts", import.meta.url), "utf8");

  it("열이 쌓이는 좁은 폭에서는 재지 않는다 — 한 화면에 못 넣으니 페이지가 흐르게 둔다", () => {
    expect(hook).toContain('const WIDE = "(min-width: 1024px)";');
    expect(hook).toMatch(/if \(!wide\.matches\) \{\s*setRootHeight\(undefined\);\s*setCanvasSpace\(undefined\);\s*return;/);
  });

  it("셸의 아래 여백만큼 비운다 — 안 비우면 바닥에 붙어 다시 넘친다", () => {
    expect(hook).toContain("const BOTTOM_GAP = 24;");
    expect(hook).toContain("bottomGap: BOTTOM_GAP");
  });

  it("위·열·아래 묶음이 바뀌면 다시 잰다", () => {
    expect(hook).toContain("observer.observe(root.parentElement)");
    expect(hook).toContain("observer.observe(columnRef.current)");
    expect(hook).toContain("observer.observe(belowRef.current)");
  });

  it("**가로는 캔버스에 따라 안 변하는 바깥 폭으로 잰다** — 격자 폭으로 재면 스스로를 키운 채 굳었다", () => {
    expect(hook).toContain("outer.clientWidth - COLUMN_GAPS - OTHER_COLUMNS_MIN_REM * rem");
    expect(hook).not.toMatch(/grid\.clientWidth/);
  });

  it("뒤 세 열의 최소 폭이 화면의 열 정의와 같다", () => {
    expect(hook).toContain("OTHER_COLUMNS_MIN_REM = 11 + 14 + 15");
    expect(client).toContain("_minmax(11rem,15rem)_minmax(14rem,22rem)_minmax(15rem,1fr)]");
  });
});
