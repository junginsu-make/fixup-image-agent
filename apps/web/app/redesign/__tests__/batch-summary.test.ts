import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { batchSummaryMessage } from "../batch-summary";

/**
 * **왜 멈췄는지가 숫자에 덮이지 않는다**(F-7-3 의 「오류 표시」).
 */

describe("일괄 생성 결과를 말한다", () => {
  it("**다 만들었으면 숫자만 말한다**", () => {
    const 말 = batchSummaryMessage({ requested: 8, completed: 8 });

    expect(말).toContain("성공 8장");
    expect(말).not.toContain("확인 필요");
  });

  /**
   * **이유가 앞에 온다.** 사람이 먼저 읽어야 하는 것은 숫자가 아니라 이유다.
   */
  it("**중간에 멈췄으면 이유를 먼저 말한다**", () => {
    const 말 = batchSummaryMessage({
      requested: 8, completed: 4,
      reason: "업로드한 자료를 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });

    expect(말.startsWith("업로드한 자료를 분석하지 못했습니다")).toBe(true);
    expect(말).toContain("성공 4장");
    expect(말).toContain("미시도 3장");
  });

  it("**이유를 모르면 숫자만 말한다** — 취소처럼 이유가 없을 수 있다", () => {
    const 말 = batchSummaryMessage({ requested: 8, completed: 4 });

    expect(말).toContain("성공 4장");
    expect(말).toContain("확인 필요 1장");
  });

  it("**다 만들었으면 이유를 말하지 않는다** — 앞 장의 옛 오류가 따라붙으면 안 된다", () => {
    const 말 = batchSummaryMessage({ requested: 8, completed: 8, reason: "지난 번 오류" });

    expect(말).not.toContain("지난 번 오류");
  });

  it("**한 장만 남기고 멈췄으면 미시도를 말하지 않는다**", () => {
    const 말 = batchSummaryMessage({ requested: 2, completed: 1, reason: "터졌다" });

    expect(말).not.toContain("미시도");
  });
});

/**
 * **조립기를 만들어 두고 화면이 안 쓰면 아무것도 안 고친 것이다.**
 *
 * 이 저장소가 이미 겪은 꼴이다 — 조립기는 있는데 내보내기가 직접 짓고 있었다
 * (X-07). 마법사는 렌더 시험 틀이 없어 실제로 돌려 볼 수 없으므로, **연결
 * 자체**를 여기서 잠근다.
 */
describe("마법사가 그 조립기를 쓴다", () => {
  const 읽기 = (name: string) =>
    readFileSync(new URL(`../${name}`, import.meta.url), "utf8")
      // 주석은 읽는 사람에게만 말한다. 코드로 오인하지 않는다.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  const wizard = 읽기("redesign-wizard.tsx");

  it("**조립기를 부른다**", () => {
    expect(wizard).toContain("batchSummaryMessage(");
  });

  it("**이유를 실어 부른다** — 안 실으면 전과 똑같이 숫자만 뜬다", () => {
    const 부른자리 = wizard.slice(wizard.indexOf("batchSummaryMessage("));

    expect(부른자리.slice(0, 200)).toContain("reason");
  });

  /**
   * **바로 그 자리에서 남기는지를 본다.**
   *
   * 처음에는 파일 어디든 `lastGenerateErrorRef.current =` 가 있으면 통과하게
   * 적었다. 그런데 루프 앞에 **초기화**하는 줄이 따로 있어서, catch 의 저장을
   * 통째로 지워도 시험이 초록이었다(2026-09-21 변이에서 드러남).
   *
   * 그래서 **실패를 다루는 자리**만 잘라서 본다.
   */
  it("**실패한 자리에서 이유를 남긴다** — 안 남기면 바깥이 실을 것이 없다", () => {
    const 실패자리 = wizard.slice(wizard.indexOf('reportClientLog("generate:error"'));
    expect(실패자리, "generate:error 자리를 못 찾았다").toBeTruthy();

    expect(실패자리.slice(0, 900)).toContain("lastGenerateErrorRef.current =");
  });

  /**
   * **취소는 이유가 아니다.**
   *
   * 취소하면 `error` 가 `AbortError` 라, 그 `message`(영어 내부 문구)를 그대로
   * 남기면 요약 앞에 붙어 사용자에게 보인다. 취소에는 제 문구가 따로 있다.
   *
   * 마법사는 렌더 시험 틀이 없어 실제로 돌려 볼 수 없다. **글로 잠근다** —
   * 다른 방법이 없어서이지, 이것이 더 나아서가 아니다.
   */
  it("**취소는 이유로 남기지 않는다**", () => {
    const 실패자리 = wizard.slice(wizard.indexOf('reportClientLog("generate:error"'));

    expect(실패자리.slice(0, 900)).toMatch(/lastGenerateErrorRef\.current = isAbortError\(error\) \? ""/);
  });

  /**
   * **한 자리만 보면 나머지가 샌다.**
   *
   * 처음에는 일괄 생성 자리만 2,000자 잘라 봤다. 그런데 「나머지 섹션 생성」이
   * **같은 문구를 손으로 또 짓고 있었다** — 그 경로에서는 왜 멈췄는지가
   * 여전히 안 보였다(2026-09-21 조사에서 드러남). 화면 전체를 본다.
   */
  it("**옛 숫자 문구를 직접 짓는 자리가 없다** — 두 벌이면 한쪽만 고치는 날 갈린다", () => {
    expect(wizard).not.toMatch(/setToast\(`[^`]*결과: 성공 \$\{/);
  });

  it("**결과를 알리는 자리는 모두 조립기를 쓴다**", () => {
    const 부른횟수 = [...wizard.matchAll(/batchSummaryMessage\(/g)].length;

    // 일괄 생성과 나머지 섹션 생성. 둘 다 여러 장을 한 장씩 만든다.
    expect(부른횟수).toBeGreaterThanOrEqual(2);
  });

  /**
   * **부른다는 것만으로는 모자라다.** 이유를 안 실으면 전과 똑같이 숫자만
   * 뜬다 — 이 항목이 막으려던 바로 그 꼴이다.
   */
  it("**나머지 섹션 생성도 이유를 실어 부른다**", () => {
    const 나머지 = wizard.slice(wizard.indexOf("generate-rest:start"));
    const 부른자리 = 나머지.slice(나머지.indexOf("batchSummaryMessage({"));

    expect(부른자리.slice(0, 300)).toContain("reason: lastGenerateErrorRef.current");
  });

  it("**나머지 섹션 생성도 지난 실패를 지우고 시작한다**", () => {
    const 나머지 = wizard.slice(wizard.indexOf("generate-rest:start"));

    expect(나머지.slice(0, 1200)).toContain('lastGenerateErrorRef.current = ""');
  });
});
