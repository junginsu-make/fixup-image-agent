import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COST_LAB_DIR } from "../cost-lab";

/*
  비용 전략실의 「플랜 기본값」 탭 — 화면 배선만 본다.
  숫자 계산은 `cost-forecast/__tests__/subscription-plans.test.ts` 가 본다.
*/
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(path.join(WEB, COST_LAB_DIR, "index.html"), "utf8");
const source = readFileSync(path.join(WEB, "app/admin/cost-lab/source/plans-ui.js"), "utf8").replace(/\r\n/g, "\n");

describe("플랜 기본값 탭", () => {
  it("통합 요약 바로 다음 탭이다", () => {
    const order = [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]);
    expect(order.slice(0, 2)).toEqual(["overview", "plans"]);
  });

  it("패널이 있고, 탭 전환이 이 이름을 받아 준다", () => {
    expect(html).toMatch(/<section id="plans" role="tabpanel" aria-labelledby="tab-plans" hidden>/);
    expect(html).toMatch(/\['overview','wallet','production','market','plans'\]\.includes\(id\)/);
  });

  it("스크립트가 그릴 자리가 모두 있다", () => {
    for (const id of ["plans-rows", "plans-usage", "plans-wadiz", "plans-wadiz-note", "plans-apply", "plans-reset", "plans-error", "plans-applied"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("생성 영역에 지금 소스가 들어 있다 — 소스만 고치고 재생성을 잊지 않는다", () => {
    const block = html.slice(html.indexOf("<!-- plans-ui:start -->"), html.indexOf("<!-- plans-ui:end -->"));
    expect(block.replace(/\r\n/g, "\n")).toContain(source.trim());
  });

  it("엔진 번들이 계산 함수를 내준다", () => {
    const engine = html.slice(html.indexOf("<!-- forecast-engine:start -->"), html.indexOf("<!-- forecast-engine:end -->"));
    for (const name of ["pricePlans", "validatePlanInputs", "PLAN_DEFAULTS"]) expect(engine).toContain(name);
  });

  it("처음 열 때 선택한 플랜(기본 베이직)을 통합 요약·충전형에 넣는다 — 공유 링크로 연 경우는 빼고", () => {
    expect(source).toContain("selected: 'basic'");
    expect(source).toMatch(/if \(!\(typeof hasRestoredSession !== 'undefined' && hasRestoredSession\)\) apply\(selected, false\);/);
    expect(source).toContain("topup: p.paidPrice");
    expect(source).toContain("state.price = p.paidPrice; state.credits = p.credits;");
  });
});
