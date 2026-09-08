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
    expect(source).toContain("<WorkingBanner label={busy.label} hint={busy.hint} />");
    expect(source, "회색 띠로 되돌아가면 안 된다").not.toMatch(
      /busy \? \(\s*<div role="status" className="rounded-md border border-border bg-muted\/40/,
    );
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
