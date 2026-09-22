import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { failedSectionLines, mergeFailedSections } from "../failed-sections";

/**
 * **어느 섹션이 왜 안 만들어졌는지 화면이 한 번도 안 읽었다**(F-7-8).
 *
 * 설계 §14.6: 「failedSections 미표시·토스트만 존재 | **영구 상태·섹션별
 * 실패/미시도 이유 표시** | W4 / T-JOB」.
 *
 * 코어는 이미 이유를 만든다. 실패한 섹션에는 제공자가 준 말이, **시도조차 못
 * 한 섹션**에는 「앞 섹션이 실패해 시도하지 않았습니다」가 붙는다
 * (`packages/redesign-core/src/generate.ts`).
 *
 * 그런데 `failedSections` 라는 낱말이 **코어와 그 시험 밖에는 저장소 전체에
 * 0건**이었다(2026-09-21 조사). 화면의 `Project` 타입에 칸조차 없다.
 *
 * 사용자가 보는 것은 집계 숫자뿐이다 — 「성공 4장 · 실패 1장 · 미시도 3장」.
 * **어느 장이 왜 빠졌는지 알 길이 없어** 여덟 장을 통째로 다시 만든다.
 */

const 실패 = (id: string, name: string, error: string) => ({ section_id: id, name, error });

describe("어느 장이 왜 빠졌는지 줄로 만든다", () => {
  it("**섹션 번호와 까닭을 함께 말한다**", () => {
    const 줄 = failedSectionLines([실패("S3", "S3 베네핏", "요청 한도를 넘었습니다")]);

    expect(줄).toHaveLength(1);
    expect(줄[0]!.label).toContain("S3");
    expect(줄[0]!.reason).toContain("요청 한도");
  });

  /**
   * **실패와 미시도는 다르다.** 앞이 막혀 시도조차 못 한 것은 다시 누르면
   * 되는 경우가 많다.
   */
  it("**시도조차 못 한 것을 따로 표시한다**", () => {
    const 줄 = failedSectionLines([
      실패("S3", "S3 베네핏", "요청 한도를 넘었습니다"),
      실패("S4", "S4 USP", "앞 섹션이 실패해 시도하지 않았습니다. 잠시 후 이 섹션만 다시 만들 수 있습니다."),
    ]);

    expect(줄[0]!.skipped).toBe(false);
    expect(줄[1]!.skipped).toBe(true);
  });

  it("**빈 목록이면 아무 줄도 안 만든다**", () => {
    expect(failedSectionLines([])).toEqual([]);
    expect(failedSectionLines(undefined)).toEqual([]);
  });

  it("**모양이 아닌 것이 섞여 와도 안 터진다**", () => {
    const 줄 = failedSectionLines([null, 실패("S2", "S2 문제", "터졌다"), {}] as never);

    expect(줄).toHaveLength(1);
    expect(줄[0]!.label).toContain("S2");
  });

  it("**까닭이 없으면 그렇게 말한다** — 빈 줄로 두면 왜 빠졌는지 모른다", () => {
    const 줄 = failedSectionLines([{ section_id: "S5", name: "S5 근거" }] as never);

    expect(줄[0]!.reason).toBeTruthy();
  });

  it("**사용자에게 보이는 말에 줄표를 안 쓴다**", () => {
    const 줄 = failedSectionLines([실패("S3", "S3 베네핏", "터졌다")]);

    expect(줄[0]!.label).not.toContain("—");
    expect(줄[0]!.reason).not.toContain("—");
  });
});

/**
 * **이어 만들면 앞의 실패가 사라져야 한다.**
 *
 * 한 장씩 나눠 부르므로, S3 이 실패한 뒤 S3 을 다시 만들어 성공하면 그 줄은
 * 없어져야 한다. 안 없어지면 다 만들고도 「실패 1장」이 남는다.
 */
describe("다시 만들어 성공하면 줄이 사라진다", () => {
  it("**성공한 섹션의 줄은 지운다**", () => {
    const 남은것 = mergeFailedSections(
      [실패("S3", "S3 베네핏", "터졌다"), 실패("S4", "S4 USP", "안 했다")],
      [실패("S4", "S4 USP", "안 했다")],
      ["S3"],
    );

    expect(남은것.map((section) => section.section_id)).toEqual(["S4"]);
  });

  it("**새로 실패한 것은 더한다**", () => {
    const 남은것 = mergeFailedSections([], [실패("S5", "S5 근거", "터졌다")], []);

    expect(남은것.map((section) => section.section_id)).toEqual(["S5"]);
  });

  it("**같은 섹션이 두 줄로 남지 않는다**", () => {
    const 남은것 = mergeFailedSections(
      [실패("S3", "S3 베네핏", "옛 까닭")],
      [실패("S3", "S3 베네핏", "새 까닭")],
      [],
    );

    expect(남은것).toHaveLength(1);
    // 새로 온 까닭이 이긴다. 옛 까닭은 지난 번 이야기다.
    expect(남은것[0]!.error).toBe("새 까닭");
  });

  it("**만들어진 섹션은 실패 목록에 안 남는다**", () => {
    const 남은것 = mergeFailedSections([실패("S1", "S1 히어로", "터졌다")], [], ["S1"]);

    expect(남은것).toEqual([]);
  });
});

/**
 * **조립기를 만들어 두고 화면이 안 쓰면 아무것도 안 고친 것이다**(X-07 의 교훈).
 */
describe("화면이 그것을 쓴다", () => {
  const 읽기 = (name: string) =>
    readFileSync(new URL(`../${name}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  const wizard = 읽기("redesign-wizard.tsx");
  const model = 읽기("redesign-model.ts");
  const results = 읽기("redesign-results.tsx");

  it("**작업에 실패 목록을 담는 칸이 있다**", () => {
    expect(model).toContain("failedSections");
  });

  it("**응답의 실패 목록을 작업에 싣는다**", () => {
    expect(wizard).toContain("failedSections");
  });

  it("**이어 만들 때 합친다** — 안 합치면 다 만들고도 실패가 남는다", () => {
    expect(wizard).toContain("mergeFailedSections(");
  });

  it("**결과 화면이 줄을 그린다**", () => {
    expect(results).toContain("failedSectionLines(");
  });
});

/**
 * **안 쓰인 참조를 화면이 말한다**(N-9, 설계 §1 불변조건 7).
 *
 * 리디자인은 참조를 상한에서 자른다. 그 자체는 맞다 — 모델이 받을 수 있는
 * 장수가 정해져 있고, 자르는 차례에도 까닭이 있다(인물이 먼저, 원본 자리는
 * 최소 한 장). **문제는 안 알리는 것이었다.**
 *
 * 각도를 넷 고르고 원본이 세 장이면 각도 하나가 말없이 빠진다. 사용자는
 * 결과가 왜 다른지 알 길이 없다.
 *
 * 설계 §1 불변 조건 7: 「**참조를 조용히 버리거나**, 검사하지 못한 결과를
 * 통과로 표시하지 않는다」.
 */
describe("안 쓰인 참조를 화면이 말한다", () => {
  const 읽기2 = (name: string) =>
    readFileSync(new URL(`../${name}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("**작업에 그 칸이 있다**", () => {
    expect(읽기2("redesign-model.ts")).toContain("referenceNotice");
  });

  it("**응답의 값을 작업에 싣는다**", () => {
    expect(읽기2("redesign-wizard.tsx")).toContain("referenceNotice");
  });

  it("**결과 화면이 그린다**", () => {
    const results = 읽기2("redesign-results.tsx");

    expect(results).toContain("project.referenceNotice");
    expect(results).toContain("쓰이지 않았습니다");
  });
});
