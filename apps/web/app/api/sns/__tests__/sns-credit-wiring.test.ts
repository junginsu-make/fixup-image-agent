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
const settle = readFileSync(new URL("../../../../lib/sns/settle.ts", import.meta.url), "utf8");
const stop = readFileSync(new URL("../projects/[id]/stop/route.ts", import.meta.url), "utf8");
const card = readFileSync(new URL("../projects/[id]/cards/[index]/route.ts", import.meta.url), "utf8");

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
    expect(status).toContain("active ? flow : await settleSnsReservation(");
  });

  it("**실제로 나온 값으로 다시 센다** — 예약은 추정이었다", () => {
    expect(settle).toMatch(/flow\.costs\.reduce/);
    expect(settle).toContain("creditUnits(spent + llmCostUsd(");
  });

  it("한 장도 못 만들었으면 실패로 확정한다", () => {
    expect(settle).toContain("made > 0");
  });

  it("열쇠를 지운다 — 남기면 다음 만들기가 옛 열쇠로 확정한다", () => {
    expect(settle).toContain("reservationId: undefined");
  });

  it("확정이 실패해도 결과는 돌려준다", () => {
    // 여기서 막으면 사용자가 만든 카드를 못 본다.
    expect(settle).toMatch(/} catch \{[\s\S]{0,120}\}\s*return \{/);
  });
});

/**
 * **폴링 밖에서 끝난 흐름도 장부를 닫아야 한다.**
 *
 * 확정이 `status` 안에만 있던 동안, 사이드바 「중지」로 끝났거나 그림 칸이
 * 없어 제출 안에서 끝난 흐름은 예약이 영영 안 풀렸다 — 만료까지 크레딧을
 * 묶고, 이미 나간 fal 값은 장부에 안 실렸다.
 */
describe("폴링 밖에서 끝나도 닫는가", () => {
  it("중지도 확정한다", () => {
    expect(stop).toContain("settleSnsReservation(auth.member.userId, flow");
  });

  /**
   * 원가는 모델별로 갈라야 뜻이 있다. 안 넘기면 장부에서 「단가 미등록」으로
   * 뭉쳐, 카드뉴스가 얼마짜리 방식으로 만들어졌는지 영영 알 수 없다.
   */
  it("확정할 때 모델과 장수를 함께 넘긴다", () => {
    expect(stop).toContain("project.modelId");
    expect(status).toContain("project.modelId");
    expect(settle).toContain("billableImages: made");
  });

  it("도는 중이 아닌 흐름에 열쇠가 남아 있으면 마무리한다", () => {
    expect(status).toContain("if (!hasActiveQueuedGeneration(project.data.flow)) {");
    expect(status).toMatch(/hasActiveQueuedGeneration\(project\.data\.flow\)\) \{[\s\S]{0,200}settleSnsReservation/);
  });

  it("열쇠가 없으면 아무것도 안 한다 — 부르는 쪽이 조건을 또 쓰지 않게", () => {
    expect(settle).toContain("if (!reservationId) return flow;");
  });
});

/**
 * **카드 하나 다시 만들기도 돈이다.**
 *
 * 이 길에는 예약도 확정도 없었다. 게다가 `startQueuedFlow` 가 `generation` 을
 * 새로 만들어서 남아 있던 열쇠까지 지워 확정 경로마저 끊었다.
 */
describe("다시 만들기가 장부에 남는가", () => {
  it("제출 전에 예약한다", () => {
    expect(card).toContain('reserveAiUsage(request, "sns_image"');
    expect(card.indexOf("reserveAiUsage")).toBeLessThan(card.indexOf("startQueuedFlow(project"));
  });

  it("그 한 장 값만 잡는다 — 전체로 잡으면 나머지가 괜히 묶인다", () => {
    expect(card).toContain("onlyCardIndexes: [index]");
  });

  it("열쇠는 startQueuedFlow 뒤에 적는다 — 먼저 적으면 지워진다", () => {
    expect(card.indexOf("startQueuedFlow(project")).toBeLessThan(card.indexOf("reservationId: reserved.requestId"));
  });

  it("제출이 실패하면 묶은 장을 돌려준다", () => {
    expect(card).toContain('finalizeAiUsage(reservation, false, 0, "sns_card_retry_failed")');
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
    expect(settle).toContain("Math.max(0, total - (flow.generation?.costBaselineUsd ?? 0))");
  });

  it("이번에 고른 장만 센다 — 옛 카드는 안 센다", () => {
    // 전부 세면 다시 만들기에서 「한 장도 못 만들었다」가 영영 안 나온다.
    expect(settle).toContain("selectedCardIndexes");
    expect(settle).toContain("picked.has(card.index)");
  });

  it("검수에 걸린 장도 나온 장으로 센다", () => {
    // `review_required` 는 그림이 이미 만들어졌고 fal 값도 다 나간 상태다.
    // `"done"` 만 세면 여섯 장이 모두 검수에 걸릴 때 `made` 가 0 이 되고,
    // `finalize_generation` 이 소비량을 0 으로 만들어 나간 비용이 사라진다.
    // 확정 셈이 `lib/sns/settle.ts` 로 옮겨졌으므로 거기서 본다.
    expect(settle).toMatch(/card\.status === "done" \|\| card\.status === "review_required"/);
  });

  it("다시 만들기도 기준선을 적는다", () => {
    expect(card).toContain("costBaselineUsd: currentFlow.costs.reduce(");
  });

  it("확정하면 기준선도 지운다", () => {
    expect(settle).toContain("costBaselineUsd: undefined");
  });
});

/**
 * 「칸 읽어내기」도 장부에 남는가 (2026-09-14).
 *
 * 이 길은 fal 을 안 부르지만 **비전 모델은 부른다.** 그런데 계량기로 감싸지도
 * 않고 예약도 안 해서, 값이 나가는 줄조차 아무도 몰랐다. 만들기를 한 번도
 * 안 눌러도 부를 수 있어 `generate` 의 예약에도 안 묻어 들어간다.
 */
describe("레퍼런스 칸 읽어내기가 장부에 남는가", () => {
  const analyze = readFileSync(new URL("../layout/analyze/route.ts", import.meta.url), "utf8");

  it("부르기 전에 예약한다", () => {
    expect(analyze).toContain('reserveAiUsage(request, "sns_image"');
    expect(analyze.indexOf("reserveAiUsage")).toBeLessThan(analyze.indexOf("withLlmMeter"));
  });

  /**
   * 새 operation 값을 만들지 않는다. 표의 check 제약과 `reserve_generation`
   * 안의 목록을 **둘 다** 넓히는 마이그레이션이 필요한데, 한쪽만 넓히면
   * 202609090001 과 똑같이 운영이 멈춘다. 카드뉴스 몫이 맞으니 그 칸에 넣는다.
   */
  it("카드뉴스 칸에 넣는다 — 마이그레이션이 필요한 새 값을 만들지 않는다", () => {
    expect(analyze).not.toMatch(/reserveAiUsage\(request, "(?!sns_image)/);
  });

  it("계량기로 감싼다 — 감싸지 않으면 제공자가 적어도 아무 데도 안 쌓인다", () => {
    expect(analyze).toContain("withLlmMeter(");
  });

  it("실제로 쓴 값으로 확정한다 — 추정이 아니라 계량기가 센 값이다", () => {
    expect(analyze).toContain("readLlmMeter()");
    expect(analyze).toContain("llmUsd: meter.usd");
    expect(analyze).toContain("creditUnits(meter.usd)");
  });

  it("칸을 못 읽어도 확정한다 — 실패해도 값은 이미 나갔다", () => {
    // 읽기 실패는 200 으로 나가는 길이라, 여기서 안 하면 예약이 만료까지 묶인다.
    expect(analyze.match(/settleAiUsage\(|finalizeAiUsage\(/g) ?? []).not.toHaveLength(0);
  });
});
