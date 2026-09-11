import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { imageUnitUsd } from "../credit-cost";

/**
 * 리디자인 단가는 **두 곳에 있다.**
 *
 *   · 코드(`credit-cost.ts` 의 `FLAT_USD`)  — 회원에게서 깎는 장수를 정한다
 *   · DB(`model_prices`)                    — 운영 원가 장부가 곱하는 값이다
 *
 * 갈라지면 **차감과 장부가 어긋난다.** 둘 다 조용히 돌아가므로 아무도 모른다.
 * 그래서 마이그레이션 글을 읽어 코드와 맞춰 둔다.
 */

const migration = readFileSync(
  new URL("../../../../supabase/migrations/202609110001_redesign_price_fix.sql", import.meta.url),
  "utf8",
);

/** `update ... set unit_cost_usd = 0.02000 ... where model = 'x'` 에서 값을 꺼낸다. */
function priceInMigration(model: string): number | undefined {
  const found = migration
    .split(/;\s*/)
    .find((statement) => statement.includes(`model = '${model}'`) && statement.includes("unit_cost_usd"));
  const value = found && /unit_cost_usd\s*=\s*([0-9.]+)/.exec(found)?.[1];
  return value ? Number(value) : undefined;
}

describe("리디자인 단가", () => {
  /**
   * $0.19 는 잰 값이 아니었다 — 「청구서로 확인 후 조정」이라 적어 두고 굳은
   * 값이다. 실제 호출은 `quality: "low"` 이고 공개가로 $0.01~0.02 대다.
   */
  it("저품질에 맞는 값이다", () => {
    expect(imageUnitUsd("redesign-openai")).toBe(0.02);
  });

  it("코드와 DB 가 같은 값을 본다", () => {
    expect(priceInMigration("redesign-openai")).toBe(imageUnitUsd("redesign-openai"));
  });

  /** 고품질 값($0.19~0.21)으로 되돌아가면 회원이 열 배를 문다. */
  it("고품질 값으로 돌아가지 않는다", () => {
    expect(imageUnitUsd("redesign-openai")).toBeLessThan(0.1);
  });

  /** Google 은 공개가 범위($0.045~0.151) 안이다. 그대로 둔다. */
  it("Google 은 공개가 범위 안이다", () => {
    const google = imageUnitUsd("redesign-google");
    expect(google).toBeGreaterThanOrEqual(0.045);
    expect(google).toBeLessThanOrEqual(0.151);
  });
});
