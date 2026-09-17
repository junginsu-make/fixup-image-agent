import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **「AI 가 골라 채운 칸」이 끝까지 이어지는가.**
 *
 * 서버가 새 칸을 하나 만들면 이을 데가 셋이다 — 기획이 **낸다**, 저장이
 * **쓴다**, 화면이 **읽는다**. 하나라도 빠지면 조용히 아무 일도 안 일어난다.
 * 실제로 저장이 빠져서, 사람이 고쳐 없앤 표가 새로고침에 되살아났다
 * (2026-09-17 리뷰).
 *
 * **표를 뺄지는 서버가 정한다.** 화면 state 에서만 지우면 저장소에 안 닿는다.
 * 저장은 옛 값과 새 값을 둘 다 아는 자리라, 화면이 무엇을 보냈든 실제로 바뀐
 * 것만 뺄 수 있다.
 */

const plan = readFileSync(new URL("../projects/[id]/plan/route.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../projects/poster-service.ts", import.meta.url), "utf8");

describe("기획이 낸다", () => {
  it("기획 결과를 저장에 싣는다", () => {
    expect(plan).toContain("inventedSlots: plan.invented");
  });
});

describe("저장이 쓴다", () => {
  it("고친 칸을 서버가 뺀다", () => {
    expect(service).toContain(
      "keepInvented(project.data.inventedSlots, project.data.slots, slots)",
    );
  });

  it("뺀 결과를 실제로 저장한다", () => {
    expect(service).toContain("data: { ...project.data, slots, inventedSlots }");
  });

  /**
   * **옛 목록을 그대로 두면 안 된다.** 사람이 고쳐도 표가 남아, 자기가 쓴 글에
   * 「AI 가 골라 채움」이 붙어 있는 꼴이 된다.
   */
  it("옛 목록을 그대로 흘리지 않는다", () => {
    expect(service).not.toContain("data: { ...project.data, slots }, status:");
  });
});
