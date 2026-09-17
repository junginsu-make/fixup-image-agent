import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **아이콘 단추는 스스로를 설명해야 한다**(2026-09-17 사용자 보고).
 *
 * 작업물 카드 왼쪽 위의 줄 세 개(`ListOrdered`)를 누르면 단계 화면으로 간다.
 * 그런데 그림만 봐서는 무슨 단추인지, 누르면 무엇이 되는지 알 수 없었다.
 * 마우스를 올리면 한 줄로 말한다 — 읽어 주는 이름(`aria-label`)만으로는
 * 눈으로 보는 사람에게 아무것도 안 보인다.
 */
const source = readFileSync(new URL("../works-tab.tsx", import.meta.url), "utf8");

describe("과정 보기 단추", () => {
  it("올려 놓으면 무엇이 되는지 말한다", () => {
    expect(source).toContain('title="과정 보기 — 만들 때 쓴 값 그대로 단계 화면을 엽니다"');
  });

  it("읽어 주는 이름도 그대로 둔다 — 화면 낭독기는 `title` 을 늦게 읽는다", () => {
    expect(source).toContain("aria-label={`${work.title} 과정 보기`}");
  });
});
