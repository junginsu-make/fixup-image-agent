import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 공유 미리보기 그림이 **가리키는 자리에 실제로 있는가.**
 *
 * 여기가 틀어져도 화면은 멀쩡하다. 우리 페이지는 이 그림을 쓰지 않기 때문이다.
 * 대신 남이 링크를 받았을 때 그림 없는 카드가 뜬다 — 우리가 볼 수 없는 곳에서
 * 조용히 망가진다. 그래서 값으로 잰다.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const LAYOUT = readFileSync(join(WEB_ROOT, "app", "layout.tsx"), "utf8");

/** `images: [{ url: "/..." }]` 과 `images: ["/..."]` 양쪽에서 경로를 걷어 온다. */
function referencedImages(): string[] {
  const found = LAYOUT.match(/"\/og[^"]*\.png"/g) ?? [];
  return [...new Set(found.map((quoted) => quoted.slice(1, -1)))];
}

describe("공유 미리보기 그림", () => {
  it("openGraph 와 twitter 가 같은 그림을 가리킨다", () => {
    // 둘이 갈라지면 카카오톡과 트위터에 다른 그림이 뜬다.
    expect(referencedImages()).toHaveLength(1);
  });

  it("가리키는 파일이 public 에 실제로 있다", () => {
    for (const image of referencedImages()) {
      expect(existsSync(join(WEB_ROOT, "public", image.slice(1)))).toBe(true);
    }
  });

  /**
   * 그림을 바꿀 때는 **파일 이름도 바꿔야 한다.** 긁는 쪽은 이미지를 주소별로
   * 캐시해서, 같은 주소에 내용만 갈아 끼우면 옛 그림이 계속 나간다. 2026-09-10
   * 에 두 번 바꿨는데 카카오톡에는 끝까지 첫 번째 것이 떴다.
   */
  it("한 번 태워 먹은 이름(og.png)으로 돌아가지 않는다", () => {
    expect(referencedImages()).not.toContain("/og.png");
  });
});
