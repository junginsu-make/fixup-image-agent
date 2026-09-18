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

describe("다시 짜도 이전 구성으로 되돌릴 수 있다", () => {
  const client = 소스("PdpMakerClient.tsx");

  it("**재기획 직전 구성을 들고 있는다**", () => {
    // 설계 §4.2: 「이전 revision을 보존한다」
    expect(client).toContain("setPreviousPlan(strategyDirective ? result : null)");
  });

  /*
    「처음 기획이면 되돌릴 것이 없다」는 여기서 안 잰다 — `toContain("onRestorePreviousPlan={")`
    는 삼항을 뒤집어도 통과한다. **빨개질 수 없는 시험은 시험이 아니다.**
    실제 보장은 `replan-live.test.tsx` 가 화면을 띄워 한다.
  */

  it("되돌리면 심사 결과도 함께 돌아온다", () => {
    expect(client).toContain("setReview(restoring.review)");
  });
});

describe("클릭 이벤트가 전략으로 새지 않는다", () => {
  const client = 소스("PdpMakerClient.tsx");

  it("**분석 단추는 인자 없이 부른다**", () => {
    // `onClick={handleAnalyze}` 로 두면 클릭 이벤트가 첫 인자가 되어, 기획
    // 요청에 이벤트 객체가 전략 지시로 실린다.
    expect(client).toContain("onClick={() => void handleAnalyze()}");
    expect(client).not.toContain("onClick={handleAnalyze}");
  });
});
