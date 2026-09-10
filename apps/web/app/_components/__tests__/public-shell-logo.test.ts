import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 로고 색이 **주변 글자색을 물려받는다.**
 *
 * `BrandMark` 의 회색 둘은 `fill="currentColor"` 다. 테마 양쪽에서 보이게
 * 하려고 그렇게 뒀는데(`packages/ui/src/components/brand-mark.tsx`), 그 대가로
 * **부모에 걸린 글자색이 그대로 로고에 온다.**
 *
 * 푸터 상자에는 `text-muted-foreground` 가 걸려 있다. 색을 안 박으면 헤더에서는
 * 또렷하고 푸터에서만 반쯤 묻힌다 — 밝은 테마에서 대비가 36% 떨어진다.
 * `currentColor` 로 바꾼 이유(한쪽에서 묻히는 것)를 푸터에서 다시 만드는 셈이다.
 *
 * jsdom 이 없는 저장소라 그려 볼 수 없다. 소스를 글자로 읽어 **흐린 상자와
 * 색 지정이 짝을 이루는지**를 본다.
 */
const shell = readFileSync(
  path.join(process.cwd(), "app/_components/public-shell.tsx"),
  "utf8",
);

/** `export function 이름(` 부터 다음 `export function` 앞까지. */
function body(name: string): string {
  const start = shell.indexOf(`export function ${name}(`);
  expect(start, `${name} 를 못 찾았다`).toBeGreaterThan(-1);
  const next = shell.indexOf("export function ", start + 1);
  return shell.slice(start, next === -1 ? undefined : next);
}

describe("공개 화면 로고", () => {
  it("푸터 상자가 흐린 글자색을 쓴다 — 이 시험이 지키려는 조건", () => {
    // 이 전제가 깨지면 아래 단정의 뜻도 달라진다. 먼저 확인한다.
    expect(body("PublicFooter")).toContain("text-muted-foreground");
  });

  it("로고가 자기 색을 박는다 — 상자 색을 안 물려받는다", () => {
    expect(body("PublicLogo")).toMatch(/<BrandMark className="[^"]*\btext-foreground\b/);
  });

  it("헤더와 푸터가 같은 로고를 쓴다", () => {
    // 둘이 갈리면 같은 화면 위아래에서 다른 로고가 뜬다.
    expect(body("PublicHeader")).toContain("<PublicLogo />");
    expect(body("PublicFooter")).toContain("<PublicLogo />");
  });
});
