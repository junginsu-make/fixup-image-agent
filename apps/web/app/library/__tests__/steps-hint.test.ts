import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **아이콘 단추는 스스로를 설명해야 한다**(2026-09-17 사용자 보고).
 *
 * 작업물 카드 왼쪽 위의 줄 세 개(`ListOrdered`)를 누르면 단계 화면으로 간다.
 * 그림만 봐서는 무슨 단추인지, 누르면 무엇이 되는지 알 수 없었다.
 *
 * **브라우저 기본 말풍선(`title`)으로는 안 됐다.** 1초쯤 가만히 둬야 뜨고
 * 환경에 따라 아예 안 떠서, 배포 뒤 사용자가 「올려도 아무것도 안 뜬다」고
 * 알려 왔다. 그래서 올리는 즉시 뜨는 말풍선을 직접 그린다.
 */
const source = readFileSync(new URL("../works-tab.tsx", import.meta.url), "utf8");
const button = source.slice(
  source.indexOf("aria-label={`${work.title} 과정 보기`}"),
  source.indexOf("</button>", source.indexOf("aria-label={`${work.title} 과정 보기`}")),
);

describe("과정 보기 단추", () => {
  it("올리는 즉시 말풍선이 뜬다", () => {
    expect(button).toContain("group-hover:opacity-100");
    // 키보드로 옮겨 와도 떠야 한다.
    expect(button).toContain("group-focus-visible:opacity-100");
    expect(button).toMatch(/className=\{cn\(CORNER_BUTTON, "group /);
  });

  it("무슨 단추이고 누르면 무엇이 되는지 말한다", () => {
    expect(button).toContain("<b>과정 보기</b>");
    expect(button).toContain("만들 때 쓴 값이 채워진 단계 화면으로 갑니다");
  });

  it("**기본 말풍선으로 돌아가지 않는다** — 안 뜨던 방식이다", () => {
    expect(button).not.toMatch(/\btitle=/);
  });

  /**
   * **안 가리고 안 잘린다**를 정하는 값 셋(2026-09-17 독립 리뷰: 셋 다 지워도 초록이었다).
   *
   *   opacity-0    없으면 말풍선이 늘 떠서 모든 카드 그림을 가린다
   *   top-full     bottom 으로 바뀌면 카드 위로 넘어가 잘린다(카드가 overflow-hidden)
   *   max-w-[9rem] 없으면 한 줄로 길어져 오른쪽이 잘린다
   */
  it("평소에는 숨어 있고, 단추 아래로, 카드 폭 안에서 뜬다", () => {
    expect(button).toContain("opacity-0");
    expect(button).toContain("top-full");
    expect(button).not.toContain("bottom-full");
    expect(button).toContain("max-w-[9rem]");
  });

  it("말풍선이 누르기를 가로채지 않는다", () => {
    // 카드 위에 겹쳐 뜨므로, 가로채면 그 아래 그림을 못 누른다.
    expect(button).toContain("pointer-events-none");
  });

  it("읽어 주는 이름은 그대로 두고, 말풍선은 읽지 않는다 — 두 번 읽으면 안 된다", () => {
    expect(button).toContain("aria-label={`${work.title} 과정 보기`}");
    expect(button).toMatch(/<span\s+aria-hidden/);
  });
});
