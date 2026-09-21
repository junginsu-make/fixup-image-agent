import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FONT_OPTIONS, DEFAULT_FONT_FAMILY, normalizeFontFamily } from "../editor-options";
import { normalizeTextOverlay } from "../pdp-canvas-utils";

/**
 * **고를 수 있는 글꼴은 실제로 있는 글꼴이어야 한다.**
 *
 * 편집기가 「Pretendard」와 「Noto Sans KR」을 보여 줬는데, 이 저장소가 부르는
 * 이름은 `Pretendard Variable` 하나뿐이고 Noto 는 파일도 선언도 없다. 그래서
 * 고른 대로 안 찍히고 **OS 기본 글꼴로 떨어진다** — 화면에도, 내려받은 그림에도.
 *
 * 같은 사고가 이미 있었다. `layout.tsx` 머리말이 적어 두었다 — `packages/ui` 의
 * `--font-sans` 가 "Pretendard" 를 맨 앞에 적어 두고도 **불러오지 않아서**
 * 깔려 있는 사람만 보고 나머지는 맑은 고딕으로 떨어졌다.
 *
 * 눈으로 대조하지 않고 값으로 잰다.
 */
const 선언된글꼴 = new Set(
  [...readFileSync(new URL("../../pretendard.css", import.meta.url), "utf8")
    .matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]!),
);

/** 어느 기계에나 있는 것. 부르지 않아도 된다. */
const 시스템글꼴 = new Set(["serif", "sans-serif", "monospace", "Georgia", "Arial", "Times New Roman"]);

/** `'Pretendard Variable', sans-serif` → `Pretendard Variable` */
function 첫이름(value: string): string {
  return value.split(",")[0]!.trim().replace(/^['"]|['"]$/g, "");
}

describe("편집기 글꼴 목록", () => {
  it.each(FONT_OPTIONS.map((option) => [option.label, option.value]))(
    "%s 는 실제로 부르는 글꼴이다",
    (_label, value) => {
      const name = 첫이름(value);
      expect(선언된글꼴.has(name) || 시스템글꼴.has(name)).toBe(true);
    },
  );

  it("**이름 있는 글꼴에는 대체를 적는다** — 못 찾으면 무엇으로 떨어질지 정해 둔다", () => {
    // `monospace` 같은 총칭은 그 자체가 대체다. 이름 있는 글꼴만 본다.
    for (const option of FONT_OPTIONS) {
      if (시스템글꼴.has(첫이름(option.value)) && !option.value.includes("'")) continue;
      expect(option.value.split(",").length, `${option.label} 에 대체 글꼴이 없다`).toBeGreaterThan(1);
    }
  });

  it("한글이 찍히는 글꼴이 하나는 있다", () => {
    const 한글가능 = FONT_OPTIONS.some((option) => 선언된글꼴.has(첫이름(option.value)));
    expect(한글가능).toBe(true);
  });
});

describe("새 레이어의 기본 글꼴", () => {
  it("**기본값이 목록 안에 있다** — 목록에 없는 값이 기본이면 아무도 못 고친다", () => {
    expect(FONT_OPTIONS.map((option) => option.value)).toContain(DEFAULT_FONT_FAMILY);
  });

  it("기본값도 실제로 부르는 글꼴이다", () => {
    expect(선언된글꼴.has(첫이름(DEFAULT_FONT_FAMILY))).toBe(true);
  });
});

describe("옛 초안에 저장된 글꼴", () => {
  it("**없는 글꼴로 저장된 레이어를 되살린다** — 안 그러면 옛 작업만 계속 깨진다", () => {
    expect(normalizeFontFamily("'Pretendard', sans-serif")).toBe(DEFAULT_FONT_FAMILY);
    expect(normalizeFontFamily("'Noto Sans KR', sans-serif")).toBe(DEFAULT_FONT_FAMILY);
  });

  it("지금도 쓸 수 있는 값은 그대로 둔다", () => {
    for (const option of FONT_OPTIONS) {
      expect(normalizeFontFamily(option.value)).toBe(option.value);
    }
  });

  it("빈 값이면 기본으로 떨어진다", () => {
    expect(normalizeFontFamily(undefined)).toBe(DEFAULT_FONT_FAMILY);
    expect(normalizeFontFamily("")).toBe(DEFAULT_FONT_FAMILY);
  });
});

describe("옛 레이어를 실제로 되살린다", () => {
  const 옛레이어 = (fontFamily: string) =>
    ({
      id: "t1", text: "문구", x: 10, y: 10, width: 100, height: 40,
      fontSize: 24, color: "#fff", fontFamily, fontWeight: "700",
      textAlign: "left" as const, lineHeight: 1.3, backgroundColor: "transparent",
    });

  it("**저장돼 있던 없는 글꼴이 읽을 때 고쳐진다** — 함수만 있고 안 부르면 소용없다", () => {
    const 살아남 = normalizeTextOverlay(옛레이어("'Pretendard', sans-serif") as never);

    expect(살아남.fontFamily).toBe(DEFAULT_FONT_FAMILY);
  });

  it("지금 쓰는 값은 그대로 둔다", () => {
    const 그대로 = normalizeTextOverlay(옛레이어(FONT_OPTIONS[1]!.value) as never);

    expect(그대로.fontFamily).toBe(FONT_OPTIONS[1]!.value);
  });
});
