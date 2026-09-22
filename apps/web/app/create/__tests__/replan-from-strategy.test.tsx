import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **전략 수정과 구성 재설계를 화면이 구분하는가**(U-11).
 *
 * 전에는 「전체 전략」이 그냥 글상자였다. 고쳐도 섹션은 그대로인데 화면이 그
 * 사실을 말하지 않아, 사용자는 고친 전략이 반영된 줄 알고 이미지를 만들었다 —
 * 한 장에 값이 드는데 나온 그림은 옛 전략을 따른다.
 *
 * 반대편에는 「설정 바꿔 다시 만들기」뿐이었고, 그것은 업로드 화면까지 되돌려
 * 고쳐 둔 문구까지 통째로 버린다.
 */
const 소스 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("전략만 고치면 섹션은 안 바뀐다고 말한다", () => {
  const scenario = 소스("ScenarioEditor.tsx");

  it("**말로 알린다**", () => {
    expect(scenario).toContain("전략만 고치면 아래 섹션은 그대로입니다");
  });

  it("**따로 누를 것을 준다**", () => {
    expect(scenario).toContain("이 전략으로 구성 다시 만들기");
  });

  it("빈 전략으로는 못 누른다 — 빈 지시로 값을 쓰지 않는다", () => {
    expect(scenario).toContain("disabled={!blueprint.executiveSummary.trim()}");
  });

  it("**업로드까지 되돌리는 것과 다른 동작이다**", () => {
    // 「설정 바꿔 다시 만들기」는 그대로 남는다. 둘은 다른 일이다.
    expect(scenario).toContain("설정 바꿔 다시 만들기");
    expect(scenario).toContain("onReplanFromStrategy");
  });
});

/*
  「다시 짜도 이전 구성으로 되돌릴 수 있다」는 여기서 안 잰다.

  전에는 `setPreviousPlan(strategyDirective ? result : null)` 과
  `setReview(restoring.review)` 를 **소스 문자열로** 쟀다. 그런 시험은 같은
  일을 하는 다른 모양으로 고치면 빨개지고, 정작 화면에 안 실려도 통과한다 —
  실제로 이 둘은 구현을 한 덩이로 묶자마자 깨졌고, 동작은 멀쩡했다.

  보장은 `replan-live.test.tsx` 가 화면을 띄워 한다 — 구성안·심사·얹은 글자가
  실제로 돌아오는지, 다시 짠 쪽 것이 안 따라오는지.
*/

describe("클릭 이벤트가 전략으로 새지 않는다", () => {
  const client = 소스("PdpMakerClient.tsx");

  it("**분석 단추는 인자 없이 부른다**", () => {
    // `onClick={handleAnalyze}` 로 두면 클릭 이벤트가 첫 인자가 되어, 기획
    // 요청에 이벤트 객체가 전략 지시로 실린다.
    expect(client).toContain("onClick={() => void handleAnalyze()}");
    expect(client).not.toContain("onClick={handleAnalyze}");
  });
});
