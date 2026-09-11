import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { imageUnitUsd } from "../credit-cost";

/**
 * **품질과 단가는 한 몸이다.**
 *
 * 오늘 아침 이 둘이 어긋나 있었다 — 값은 $0.19(고품질 자리)인데 실제로는
 * `quality: "low"` 로 불렀다. **고품질 값을 받고 저품질을 만들어 주고
 * 있었다.** 둘 다 조용히 돌아가므로 아무도 몰랐다.
 *
 * 어느 쪽으로 바꾸든 상관없다. 다만 **같이** 바꿔야 한다.
 */

const generate = readFileSync(
  new URL("../../../../packages/redesign-core/src/generate.ts", import.meta.url),
  "utf8",
);

/** `const IMAGE_QUALITY = "high";` 에서 값을 꺼낸다. */
function 지금품질(): string | undefined {
  return /const IMAGE_QUALITY = "([a-z]+)"/.exec(generate)?.[1];
}

/** 품질마다 그 자리의 값. gpt-image-2 공개가 기준. */
const 품질별_단가: Record<string, { 최소: number; 최대: number }> = {
  low: { 최소: 0.005, 최대: 0.03 },
  medium: { 최소: 0.03, 최대: 0.1 },
  high: { 최소: 0.15, 최대: 0.25 },
};

describe("그림 품질", () => {
  it("어떤 품질로 부르는지 코드에 적혀 있다", () => {
    // 예전에는 호출 자리에 문자열이 박혀 있어 찾기도 어려웠다.
    expect(지금품질()).toBeDefined();
    expect(generate).toContain('form.append("quality", IMAGE_QUALITY)');
  });

  /**
   * 이 저장소의 다른 도구는 전부 `high` 이상이다. 상세페이지는 글자가 많아
   * 저품질이 가장 안 맞는 자리다.
   */
  it("다른 도구와 같은 급이다", () => {
    expect(["high", "xhigh", "max"]).toContain(지금품질());
  });
});

describe("단가가 품질을 따라간다", () => {
  it("지금 품질에 맞는 값이다", () => {
    const 품질 = 지금품질()!;
    const 범위 = 품질별_단가[품질];

    expect(범위, `${품질} 의 단가 범위를 안 적어 뒀다`).toBeDefined();
    expect(imageUnitUsd("redesign-openai")).toBeGreaterThanOrEqual(범위!.최소);
    expect(imageUnitUsd("redesign-openai")).toBeLessThanOrEqual(범위!.최대);
  });

  /** 코드와 DB 가 갈라지면 차감과 원가 장부가 어긋난다. */
  it("코드와 DB 가 같은 값을 본다", () => {
    const migration = readFileSync(
      new URL("../../../../supabase/migrations/202609110002_redesign_high_quality_price.sql", import.meta.url),
      "utf8",
    );
    const db = /unit_cost_usd\s*=\s*([0-9.]+)/.exec(migration)?.[1];

    expect(db).toBeDefined();
    expect(Number(db)).toBe(imageUnitUsd("redesign-openai"));
  });
});
