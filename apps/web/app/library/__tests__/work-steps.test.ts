import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canOpenSteps } from "../work-steps";

/**
 * 「과정 보기」 단추를 누구에게 내는가.
 *
 * 카드 본문 클릭은 그대로 그림 뷰어를 연다(2026-09-16 사용자 결정) —
 * 쓰던 동작을 뺏지 않는다. 단추만 따로 붙인다.
 *
 * **남의 작업에는 아직 안 낸다.** 지금 눌러 봐야 단계별 화면이 404 다 —
 * 상세 화면의 데이터 경로가 RLS 를 타고, `same_team` 에 관리자 예외가 없다.
 * 2단계에서 관리자 읽기 통로를 낸 뒤에 연다.
 */
describe("canOpenSteps", () => {
  it("내 작업이면 낸다", () => {
    expect(canOpenSteps({ mine: true }, false)).toBe(true);
  });

  it("관리자라도 남의 작업에는 아직 안 낸다", () => {
    // 2단계에서 true 로 바뀐다. 그때 이 시험도 함께 고친다.
    expect(canOpenSteps({ mine: false }, true)).toBe(false);
  });

  it("남의 작업에는 안 낸다", () => {
    expect(canOpenSteps({ mine: false }, false)).toBe(false);
  });

  it("관리자인지 아직 모르면(null) 내 것만 낸다", () => {
    // `isAdmin` 은 관리 목록을 받아 봐야 정해진다. 그 전에는 null 이다.
    expect(canOpenSteps({ mine: true }, null)).toBe(true);
    expect(canOpenSteps({ mine: false }, null)).toBe(false);
  });
});

/**
 * 규칙을 만들어 놓고 화면이 안 부르면 소용이 없다.
 *
 * 이 저장소는 소스 대조 시험이 **통과만 하는** 사고를 두 번 겪었다
 * (2026-09-08·2026-09-15). 그래서 **찾지 말고 센다** — 여는 태그와 인자를
 * 한 덩어리로 보고, 자리 수를 박는다.
 */
describe("화면이 규칙을 부르는가", () => {
  const source = readFileSync(join(__dirname, "..", "works-tab.tsx"), "utf8");

  it("카드가 canOpenSteps 로 단추를 가린다", () => {
    const wired = source.match(/\{canOpenSteps\(work, isAdmin\) \?/g) ?? [];
    expect(wired.length).toBe(1);
  });

  it("단추가 그 작업의 주소로 간다", () => {
    expect(source).toContain("router.push(work.href)");
  });

  it("카드 본문 클릭은 그대로 뷰어를 연다", () => {
    // 이 줄이 바뀌면 지금 쓰던 동작을 뺏은 것이다.
    expect(source).toContain(
      "work.images.length ? openWork(work) : router.push(work.href)");
  });

  it("과정 보기 단추에 빨간 hover 가 묻지 않는다", () => {
    // 지우기 단추의 모양을 통째로 가져다 쓰면 `hover:text-destructive` 가
    // 따라온다 — 여는 단추가 빨갛게 변하면 지우는 것으로 읽힌다.
    const button = source.slice(
      source.indexOf("canOpenSteps(work, isAdmin)"),
      source.indexOf("canOpenSteps(work, isAdmin)") + 600);
    expect(button).not.toContain("DELETE_CORNER_BUTTON");
  });
});
