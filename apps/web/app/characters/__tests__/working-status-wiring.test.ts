import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 캐릭터 만들기의 **시간이 걸리는 단계는 공통 띠·칸 표시를 쓴다**(2026-10-08 사용자).
 *
 * 화면이 무거워 그려 보지 않고 소스 문장을 직접 본다(이 폴더 다른 시험과 같은 방식).
 */
const source = readFileSync(new URL("../CharacterStudio.tsx", import.meta.url), "utf8");

describe("캐릭터 — 공통 띠와 칸 표시", () => {
  it("공통 부품을 가져다 쓴다", () => {
    expect(source).toContain('from "../_components/working-status"');
    expect(source).toContain('from "../_components/item-status"');
    expect(source).toContain('from "../_components/working-words"');
  });

  it("카드 안에만 있던 MakingBox 와 따로 만든 각도 상자를 없앴다", () => {
    expect(source).not.toContain("MakingBox");
    expect(source).not.toContain("animate-pulse");
  });

  it("띠는 화면 맨 위에 하나뿐이다", () => {
    expect(source.match(/<StudioWorkingBanner/g)).toHaveLength(1);
  });

  it("정면 만드는 중은 「정면 만드는 중입니다」 띠와 걸린 시간이다", () => {
    expect(source).toContain("정면 만드는 중입니다");
    expect(source).toContain("startedAt={workStartedAt}");
    expect(source).toContain("startedAt={startedAt}");
  });

  // 한 번에 보내 끝난 장 수를 모른다 — 「0/N장」이 멈춰 보이지 않게 장 수는 문구로만(2026-10-08 검토).
  it("각도를 만들 때 끝난 장 수를 모르므로 장 수 막대를 주지 않는다", () => {
    expect(source).not.toMatch(/progress=\{[^}]*done: 0/);
  });

  it("각도마다 ItemStatusBadge 로 만드는 중을 보인다 (한 번에 보내므로 모두 working)", () => {
    expect(source).toMatch(/pending\.map\([\s\S]{0,300}<ItemStatusBadge state="working"/);
  });

  it("각도 다시·추가도 칸 표시를 쓴다", () => {
    expect(source).toMatch(/redoing === `\$\{character\.id\}:\$\{angle\.id\}`[\s\S]{0,1500}<ItemStatusBadge state="working"/);
  });

  it("정면 자리는 ItemWorkingOverlay 로 만드는 중을 보인다", () => {
    expect(source).toContain('<ItemWorkingOverlay state="working"');
  });

  it("단추 글자는 workingButton 낱말이다", () => {
    expect(source).toContain('workingButton("make")');
    expect(source).not.toContain('"정면을 만드는 중…"');
  });
});
