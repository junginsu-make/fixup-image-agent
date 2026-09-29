import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **사용 설명서로 가는 문은 사이드바 하나다**(2026-09-29 사용자 결정).
 *
 * 상단바 오른쪽에 「이용 안내」 단추가 따로 있었는데, 왼쪽 사이드바의 「사용
 * 설명서」와 같은 `/guide` 로 갔다. 같은 곳으로 가는 문이 둘이면 둘 다 읽어야
 * 하고, 이름까지 달라 다른 것으로 보인다.
 */

const shell = readFileSync(new URL("../studio-layout.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../../../../../packages/ui/src/components/app-shell.tsx", import.meta.url), "utf8");

describe("사용 설명서 문", () => {
  it("상단바에 「이용 안내」 단추를 안 단다", () => {
    expect(shell).not.toContain("GuideLink");
  });

  it("사이드바에는 그대로 있다 — 없애면 설명서로 갈 길이 없다", () => {
    expect(sidebar).toContain('{ href: "/guide", label: "사용 설명서"');
  });
});
