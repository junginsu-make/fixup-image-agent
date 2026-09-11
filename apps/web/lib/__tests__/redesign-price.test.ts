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
   * 값 자체는 품질을 따라 움직인다. **무엇이 맞는 값인지는
   * `redesign-quality.test.ts` 가 품질과 견주어 판정한다** — 여기서 숫자를
   * 또 못 박으면 품질을 바꿀 때마다 두 곳을 고쳐야 한다.
   */
  it("값이 정해져 있다", () => {
    expect(imageUnitUsd("redesign-openai")).toBeGreaterThan(0);
  });

  /** 이 마이그레이션은 저품질 시절의 것이다. 그 뒤 것은 quality 시험이 본다. */
  it("품질을 내렸던 마이그레이션이 남아 있다", () => {
    expect(priceInMigration("redesign-openai")).toBe(0.02);
  });

  /** 아는 값 중 가장 비싼 것을 넘으면 어딘가 잘못 적은 것이다. */
  it("터무니없이 비싸지 않다", () => {
    expect(imageUnitUsd("redesign-openai")).toBeLessThan(0.5);
  });

  /** Google 은 공개가 범위($0.045~0.151) 안이다. 그대로 둔다. */
  it("Google 은 공개가 범위 안이다", () => {
    const google = imageUnitUsd("redesign-google");
    expect(google).toBeGreaterThanOrEqual(0.045);
    expect(google).toBeLessThanOrEqual(0.151);
  });
});
