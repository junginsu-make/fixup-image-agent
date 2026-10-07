import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 캐릭터 만들기 화면의 **칸 높이**와 **저장 단추**(2026-10-07 사용자 보고).
 *
 * 이 저장소에는 jsdom 이 없어 화면을 그려 잴 수 없다. 화면 코드의 문장을 직접 본다.
 */
const source = readFileSync(new URL("../CharacterStudio.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../../../../packages/ui/src/styles/globals.css", import.meta.url), "utf8");

/** `marker` 가 든 JSX 요소(`tag`)의 className 값을 낱말로 나눠 돌려준다. */
function classesOf(marker: string, tag: string): string[] {
  const at = source.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const start = source.lastIndexOf(`<${tag}`, at);
  const open = source.indexOf('className="', start) + 'className="'.length;
  return source.slice(open, source.indexOf('"', open)).split(/\s+/).filter(Boolean);
}

/**
 * 남는 높이를 나눠 갖거나 0 까지 줄어드는 낱말. 이것이 있으면 모니터가 낮을 때
 * 칸이 줄어 아래 것과 겹친다.
 */
const SHRINKING = ["flex-1", "min-h-0"];

describe("묘사 칸 — 화면 크기에 따라 줄거나 사라지지 않는다", () => {
  it("묘사 칸을 감싼 줄은 남는 높이를 나눠 갖지 않는다(줄어들어 아래 칸과 겹쳤다)", () => {
    const label = classesOf('<span className="flex-none text-meta text-subtle-foreground">무엇을 만들까요</span>', "label");
    for (const word of SHRINKING) expect(label).not.toContain(word);
    expect(label).toContain("flex-none");
  });

  it("글상자는 정해진 높이다", () => {
    const textarea = classesOf("value={description}", "Textarea");
    for (const word of SHRINKING) expect(textarea).not.toContain(word);
    expect(textarea).toContain("h-40");
  });
});

/*
  **256px(h-64)다.** 화면 칸의 가장 낮은 높이(30rem)에서 오른쪽 칸 내용에 남는
  높이가 약 344px 이다. 320px 이면 아래 저장 단추가 칸 밖으로 밀려 굴려야 보인다
  (2026-10-07 리뷰). 가운데 칸도 그림 아래 역할 단추가 가려지지 않게 같다.
*/
describe("그림 자리 — 가운데·오른쪽 칸도 줄어들어 단추와 겹치지 않는다", () => {
  it("오른쪽 「이번에 만드는 것」 정면 자리는 정해진 높이다", () => {
    const box = classesOf("busy === \"candidates\" ? (", "div");
    for (const word of SHRINKING) expect(box).not.toContain(word);
    expect(box).toContain("h-64");
  });

  it("가운데 「참고할 그림」 붙인 그림 자리는 정해진 높이다", () => {
    const box = classesOf('aria-label="첨부한 그림 크게 보기"', "button");
    for (const word of SHRINKING) expect(box).not.toContain(word);
    expect(box).toContain("h-64");
  });
});

describe("저장 단추", () => {
  it("이름이 「캐릭터 저장하기」다", () => {
    // 화면에 보이는 단추 글자만 본다. 주석은 옛 이름을 까닭으로 적는다.
    expect(source).toMatch(/^\s*캐릭터 저장하기\s*$/m);
    expect(source).not.toMatch(/^\s*정면만 만들기\s*$/m);
  });

  it("정면이 나왔을 때만 녹색으로 바뀌고 고리가 번진다", () => {
    const at = source.indexOf("캐릭터 저장하기");
    const button = source.slice(source.lastIndexOf("<Button", at), at);
    expect(button).toMatch(/chosen[^\n]*bg-success/);
    expect(button).toMatch(/chosen[^\n]*fixup-cta-pulse/);
    // 밝은 화면은 흰 글자(4.98:1), 어두운 화면은 진한 글자 — 이 토큰이 둘을 맞춰 준다.
    expect(button).toContain("text-primary-foreground");
  });

  it("번지는 고리 색은 단추 색을 따른다 — 안 넘기면 지금까지처럼 강조색", () => {
    expect(css).toMatch(/var\(--cta-pulse-color,\s*var\(--primary\)\)/);
    const at = source.indexOf("캐릭터 저장하기");
    expect(source.slice(source.lastIndexOf("<Button", at), at)).toContain("[--cta-pulse-color:var(--success)]");
  });
});
