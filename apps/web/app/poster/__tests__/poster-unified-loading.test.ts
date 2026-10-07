import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **다양하게도 공통 띠·칸 표시를 쓴다**(2026-10-08 사용자 — 시간이 걸리는 단계를 한 모양으로).
 * 무거운 화면이라 소스를 읽어 잰다.
 */
const source = readFileSync(new URL("../[id]/poster-client.tsx", import.meta.url), "utf8");

describe("다양하게 띠", () => {
  it("띠가 걸린 시간을 보인다", () => {
    expect(source).toMatch(/<WorkingBanner[\s\S]{0,200}startedAt=\{busy\.startedAt\}/);
  });

  /*
    **끝난 장 수를 모르면 장 수 막대를 주지 않는다**(2026-10-08 검토). 서버가 다 만든 뒤
    한꺼번에 알려 주므로 「0/4장」이 끝까지 멈춰 있다가 사라진다. 장 수는 문구가 말한다.
  */
  it("끝난 장 수를 모르므로 장 수 막대를 주지 않고 문구로 장 수를 말한다", () => {
    expect(source).not.toMatch(/progress=\{[^}]*done: 0/);
    expect(source).toContain("makingLabel(project.data.variants)");
  });

  it("문구는 공통 낱말을 쓴다", () => {
    for (const 옛 of ["기획하는 중입니다", "검수하는 중입니다", "그리는 중입니다"]) {
      expect(source, 옛).not.toContain(`label: "${옛}"`);
    }
    for (const 새 of ["기획 중입니다", "검수 중입니다", "고치는 중입니다"]) {
      expect(source, 새).toContain(`"${새}"`);
    }
  });

  it("시작 시각은 단계가 바뀌어도 이어진다", () => {
    expect(source).toContain("startedAt: current?.startedAt ?? Date.now()");
  });
});

describe("다양하게 단추·칸", () => {
  it("단추 글자는 workingButton 이다", () => {
    for (const kind of ["plan", "make", "save", "review", "edit"]) {
      expect(source, kind).toContain(`workingButton("${kind}")`);
    }
  });

  it("빈 칸과 고치는 그림에 칸 표시가 붙는다", () => {
    expect(source).toContain("<ItemStatusBadge");
    expect(source).toContain("<ItemWorkingOverlay");
  });

  it("기획 패널은 그대로 둔다", () => {
    expect(source).toContain("<PlanWriting");
  });
});
