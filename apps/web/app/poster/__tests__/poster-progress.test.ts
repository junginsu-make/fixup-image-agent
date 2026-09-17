import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { placeholderRatio } from "../poster-form-rules";

/**
 * 「지금 돌고 있다」가 눈에 보이는가.
 *
 * 04 에서 기획이 저절로 돌기 시작하는데 표시가 **화면 맨 위 작은 회색 띠**
 * 한 줄이라 작동 중인지 알기 어려웠다. 만들기를 눌러도 대시보드는 아무 변화가
 * 없어, 사이드바 아래쪽 표시를 봐야만 알 수 있었다(2026-09-08 사용자).
 */

const source = readFileSync(new URL("../[id]/poster-client.tsx", import.meta.url), "utf8");

describe("빈 칸이 잡을 모양", () => {
  it("고른 비율을 그대로 쓴다", () => {
    expect(placeholderRatio("2:3")).toBe("2 / 3");
    expect(placeholderRatio("1:1")).toBe("1 / 1");
    expect(placeholderRatio("16:9")).toBe("16 / 9");
  });

  it("첨부를 따라가는 비율은 알 수 없다 — 기본값으로 둔다", () => {
    expect(placeholderRatio("match-source")).toBe("2 / 3");
  });

  it("이상한 값에도 안 깨진다", () => {
    // 화면이 죽는 것보다 모양이 좀 다른 편이 낫다.
    for (const bad of ["", "a:b", "0:3", "2:0", "2:3:4", "-1:2"]) {
      expect(placeholderRatio(bad), bad).toBe("2 / 3");
    }
  });
});

describe("진행 표시가 화면에 이어져 있는가", () => {
  it("조용한 회색 띠 대신 강조 띠를 쓴다", () => {
    expect(source).toMatch(/<WorkingBanner\s+label=\{busy\.label\}\s+hint=\{busy\.hint\}/);
    expect(source, "회색 띠로 되돌아가면 안 된다").not.toMatch(
      /busy \? \(\s*<div role="status" className="rounded-md border border-border bg-muted\/40/,
    );
  });

  /**
   * **멈추는 자리는 띠 하나다**(2026-09-17 사용자 결정).
   *
   * 사이드바 아래에도 같은 목록과 중지가 있어서, 만드는 동안 「진행 중」이 두
   * 군데에 보였다. 표시가 있는 자리에서 바로 멈춘다.
   */
  it("띠에서 바로 멈출 수 있다", () => {
    expect(source).toMatch(/<WorkingBanner[\s\S]{0,120}onStop=\{\(\) => void stopNow\(\)\}/);
    expect(source).toContain("stopping={stopping}");
  });

  it("중지를 누르면 **캐묻기와 도착한 응답을 둘 다 끊는다**", () => {
    // 하나만 끊으면 멈춘 뒤에 결과가 들어와 화면이 되살아난다.
    expect(source).toContain("stopped.current = true;");
    expect(source).toMatch(/const body = await \(await billableRequest\([\s\S]{0,120}if \(stopped\.current\) return;/);
  });

  /**
   * **자는 사이에 누른 중지도 걸려야 한다**(2026-09-17 독립 리뷰).
   *
   * 잠들기 전에만 보면, 자는 동안 멈춘 사람에게 최대 10초 뒤 결과가 도착해
   * 화면이 되살아난다. 그래서 세 자리에서 본다 — 자기 전 · 깬 뒤 · 답이 온 뒤.
   */
  it("캐묻기 한 바퀴에서 세 번 본다", () => {
    const loop = source.slice(source.indexOf("async function collect("));
    const checks = loop.slice(0, loop.indexOf("if (poll.done)"))
      .match(/if \(stopped\.current\) return false;/g) ?? [];
    expect(checks.length).toBe(3);
  });

  /**
   * **푸는 자리는 한 곳이다.** 갈래마다 적으면 하나를 빠뜨리고, 빠뜨린 갈래는
   * 요청만 나가고(돈은 나간다) 결과는 안 들어온다 — 고치기가 그랬다.
   */
  it("일을 시작하는 다섯 자리가 모두 같은 문을 지난다", () => {
    // 기획·만들기·고치기·검수, 그리고 돌아와서 이어받을 때.
    expect(source).toMatch(/stopped\.current = false;\s*setBusy\(state\);/);
    expect((source.match(/beginWork\(\{ kind:/g) ?? []).length).toBe(5);
    // 갈래 안에서 따로 풀면 그 자리만 또 달라진다.
    expect(source.match(/stopped\.current = false;/g)?.length).toBe(1);
  });

  it("일감으로 안 잡힌 것도 서버에 멈췄다고 알린다", () => {
    // 기획·보내는 중에 누르면 일감이 아직 목록에 없다. 그래도 예약은 잡혀 있다.
    expect(source).toMatch(/finish\(id\);[\s\S]{0,400}\/api\/poster\/projects\/\$\{project\.id\}\/stop/);
  });

  it("무엇을 하는 중인지 종류로 구분한다", () => {
    // 글자로 판단하면 문구를 고칠 때마다 조건이 깨진다.
    expect(source).toContain('busy?.kind === "generate"');
    expect(source).toContain('busy?.kind === "plan"');
  });

  it("누른 단추가 스스로 말한다", () => {
    // 띠는 위에 있고 단추는 아래에 있다. 누른 자리에도 변화가 있어야 한다.
    expect(source).toMatch(/busy\?\.kind === "plan"[\s\S]{0,120}animate-spin/);
    expect(source).toMatch(/busy\?\.kind === "generate"[\s\S]{0,160}animate-spin/);
  });

  it("그리는 동안 결과 자리에 만들 장수만큼 빈 칸을 깐다", () => {
    expect(source).toMatch(/length: project\.data\.variants/);
    expect(source).toContain("placeholderRatio(project.ratio)");
  });

  it("빈 칸은 그릴 때만 깐다 — 기획 중에는 아니다", () => {
    // 기획은 결과와 상관이 없다. 그때도 깔면 「곧 그림이 온다」는 거짓말이 된다.
    expect(source).toContain('busy?.kind === "generate" && !list.length');
  });
});
