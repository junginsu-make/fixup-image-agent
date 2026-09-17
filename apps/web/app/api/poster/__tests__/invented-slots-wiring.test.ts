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

/**
 * **글자 칸이 전부 AI 것이면 「글자를 넣지 말라」가 붙는다.**
 *
 * 전에는 「칸이 비었으면」으로 봤다. 기획을 「다 채우게」 바꾸면서 그 신호가
 * 사라졌고, 그 금지문은 2026-09-08 사고(「BEST DAY EVER!」)의 대응이다.
 *
 * **세 자리가 같은 값을 봐야 한다** — 실제 생성, 미리보기, 그리고 프롬프트를
 * 짜는 `copyLines`. 하나라도 빠지면 「모델에 보낼 프롬프트 보기」가 거짓말을
 * 하거나, 보이는 것과 다른 그림이 나온다.
 */
describe("글자 금지가 끝까지 간다", () => {
  const generate = readFileSync(
    new URL("../projects/[id]/generate/route.ts", import.meta.url), "utf8",
  );
  const client = readFileSync(
    new URL("../../../poster/[id]/poster-client.tsx", import.meta.url), "utf8",
  );

  it("실제 생성이 넘긴다", () => {
    expect(generate).toContain("invented: project.data.inventedSlots");
  });

  /** 미리보기는 화면 state 를 쓴다. 방금 고친 칸이 곧바로 반영돼야 한다. */
  it("미리보기도 넘긴다", () => {
    expect(client).toContain("previewPosterPrompt({");
    expect(client).toMatch(/invented,\s*\}\), \[slots, project, invented\]\)/);
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
