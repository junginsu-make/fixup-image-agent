import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **「진행 중」은 한 군데에서만 보인다**(2026-09-17 사용자 결정).
 *
 * 처음에는 사이드바 아래 칸에 만드는 중인 목록과 중지가 있었다. 그 뒤 화면
 * 위쪽에도 띠를 넣으면서, 이미지를 만드는 동안 같은 말이 **두 군데**에 떴다.
 * 표시는 위쪽 띠 하나로 하고, 멈추는 것도 그 띠에서 한다.
 *
 * **받아 오는 일은 그대로 셸이 한다.** 없앤 것은 칸(화면)이지 일감 관리가
 * 아니다 — `RunningJobsProvider` 가 빠지면 다른 화면으로 옮겼을 때 결과를
 * 못 받는다. 그래서 그것이 남아 있는지도 함께 잰다.
 */

const shell = readFileSync(new URL("../studio-layout.tsx", import.meta.url), "utf8");
const jobs = readFileSync(new URL("../running-jobs.tsx", import.meta.url), "utf8");
const banner = readFileSync(new URL("../../poster/_components/working-banner.tsx", import.meta.url), "utf8");
const sns = readFileSync(new URL("../../sns/[id]/project-client.tsx", import.meta.url), "utf8");

describe("만드는 중 표시", () => {
  it("사이드바에는 칸이 없다", () => {
    expect(shell).not.toContain("sidebarFooter");
    expect(shell).not.toContain("RunningJobsPanel");
    expect(jobs, "칸을 되살리면 두 군데에 다시 보인다").not.toContain("export function RunningJobsPanel");
  });

  it("셸은 그대로 결과를 받아 온다 — 없애면 화면을 옮길 때 결과를 놓친다", () => {
    expect(shell).toContain("<RunningJobsProvider>");
    expect(jobs).toContain("export function RunningJobsProvider");
  });

  it("띠에서 멈춘다", () => {
    expect(banner).toContain("onStop?: () => void;");
    expect(banner).toMatch(/onStop \? \([\s\S]{0,400}중지/);
  });

  it("띠는 값이 나갈 수 있다는 것을 숨기지 않는다", () => {
    // 사이드바 칸에 있던 말이다. 옮기면서 빠뜨리면 사용자가 비용을 오해한다.
    expect(banner).toContain("이미 보낸 요청의 비용은 나갈 수 있습니다");
  });
});

describe("카드뉴스도 띠에서 멈춘다", () => {
  it("세 가지 상태 모두 중지를 단다", () => {
    const stops = sns.match(/onStop=\{\(\) => void stopNow\(\)\}/g) ?? [];
    expect(stops.length, "기획·만들기·이어받기 셋 다 멈출 수 있어야 한다").toBe(3);
  });

  it("서버에도 멈췄다고 알리고 화면을 다시 읽는다", () => {
    // 서버에 안 알리면 다시 열었을 때 그 흐름에 또 붙는다.
    expect(sns).toMatch(/if \(job\) await stop\(job\);[\s\S]{0,200}await reload\(\);/);
  });
});
