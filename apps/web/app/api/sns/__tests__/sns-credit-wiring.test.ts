import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 카드뉴스가 **장부에 남는가** (2026-09-08).
 *
 * 지금까지 이 도구는 사용량 장부에 한 줄도 안 남겼다 — 개인 한도에도 안 걸리고
 * 팀 크레딧에서도 안 빠졌다. 운영에서 $3.315 가 장부 밖에 있었다.
 */

const generate = readFileSync(new URL("../projects/[id]/generate/route.ts", import.meta.url), "utf8");
const status = readFileSync(new URL("../projects/[id]/status/route.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../../../sns/[id]/project-client.tsx", import.meta.url), "utf8");

describe("돈이 나가기 전에 자리를 잡는가", () => {
  it("제출 전에 예약한다", () => {
    expect(generate).toContain('reserveAiUsage(request, "sns_image"');
    // 예약이 `startQueuedFlow` 보다 **먼저** 와야 한다. 뒤면 돈이 이미 나간다.
    expect(generate.indexOf("reserveAiUsage")).toBeLessThan(generate.indexOf("startQueuedFlow(project"));
  });

  it("막히면 아무것도 안 만든다", () => {
    expect(generate).toContain("if (!reserved.ok) return reserved.response;");
  });

  it("**화면이 보여 주는 그 숫자를 쓴다** — 다르게 세면 화면과 장부가 갈린다", () => {
    expect(generate).toContain("estimateCost({");
    expect(generate).toContain("creditUnits(estimate.usd + llm)");
  });

  it("글 모델 몫도 센다 — 원고 한 번 + 카드마다 장면 한 번", () => {
    expect(generate).toContain("llmCostUsd({ planCalls: 1 + estimate.generatedCount })");
  });

  it("제출이 실패하면 묶은 장을 돌려준다", () => {
    expect(generate).toContain('finalizeAiUsage(reservation, false, 0, "sns_submit_failed")');
  });

  it("예약 열쇠를 흐름에 적어 둔다 — 확정이 다른 요청에서 일어난다", () => {
    expect(generate).toContain("reservationId: reserved.requestId");
  });
});

describe("다 끝난 뒤에 확정하는가", () => {
  it("아직 도는 중이면 확정하지 않는다", () => {
    expect(status).toContain("if (!active && reservationId)");
  });

  it("**실제로 나온 값으로 다시 센다** — 예약은 추정이었다", () => {
    expect(status).toMatch(/flow\.costs\.reduce/);
    expect(status).toContain("creditUnits(spent + llmCostUsd(");
  });

  it("한 장도 못 만들었으면 실패로 확정한다", () => {
    expect(status).toContain("made > 0");
  });

  it("열쇠를 지운다 — 남기면 다음 만들기가 옛 열쇠로 확정한다", () => {
    expect(status).toContain("reservationId: undefined");
  });

  it("확정이 실패해도 결과는 돌려준다", () => {
    // 여기서 막으면 사용자가 만든 카드를 못 본다.
    expect(status).toMatch(/} catch \{[\s\S]{0,120}\}\s*settled =/);
  });
});

describe("화면이 열쇠를 보내는가", () => {
  it("열쇠 없이 보내면 서버가 거절한다", () => {
    expect(client).toContain("headers: billableHeaders()");
  });
});

/**
 * **다시 만들기가 옛 비용을 또 받으면 안 된다.**
 *
 * `flow.costs` 는 쌓이기만 하고 안 비워진다(`queued-flow.ts:215` 가 push 만
 * 한다). 합계를 그냥 쓰면 다시 만들기를 누를 때마다 이미 낸 것을 또 받는다.
 */
describe("다시 만들 때 두 번 받지 않는가", () => {
  it("예약할 때 지금까지 쓴 값을 기준선으로 적는다", () => {
    expect(generate).toContain("costBaselineUsd: currentFlow.costs.reduce(");
  });

  it("**늘어난 만큼만 받는다**", () => {
    expect(status).toContain("Math.max(0, total - (flow.generation?.costBaselineUsd ?? 0))");
  });

  it("이번에 고른 장만 센다 — 옛 카드는 안 센다", () => {
    // 전부 세면 다시 만들기에서 「한 장도 못 만들었다」가 영영 안 나온다.
    expect(status).toContain("selectedCardIndexes");
    expect(status).toMatch(/picked\.has\(card\.index\) && card\.status === "done"/);
  });

  it("확정하면 기준선도 지운다", () => {
    expect(status).toContain("costBaselineUsd: undefined");
  });
});
