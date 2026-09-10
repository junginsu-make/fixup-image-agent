import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **원가가 장부에 실리는가.**
 *
 * 2026-09-10 에 운영 장부를 열어 보니 포스터 26장과 카드뉴스 24장이 원가
 * 집계에 한 줄도 없었다. `admin_cost_by_operation` 은 상세페이지만 보여 줬고,
 * 총 원가는 실제의 3분의 1이었다.
 *
 * 원인은 단순했다 — 두 도구가 `finalizeAiUsage` 에 `cost` 를 안 넘겼다.
 * **틀려도 아무도 안 아프다**: 화면은 돌고, 회원 차감도 맞고, 장부만 빈다.
 * 그래서 값으로 잰다.
 */

const WEB = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(WEB, path), "utf8");

/** 그림을 만드는 도구는 전부 원가를 남겨야 한다. */
const 그림을_만드는_자리 = [
  { 이름: "포스터", path: "app/api/poster/projects/[id]/status/route.ts" },
  { 이름: "카드뉴스", path: "lib/sns/settle.ts" },
  { 이름: "캐릭터", path: "app/api/characters/route.ts" },
  { 이름: "캐릭터 각도", path: "app/api/characters/views/route.ts" },
  { 이름: "상세페이지", path: "app/api/pdp/images/route.ts" },
  { 이름: "상세페이지 묶음", path: "app/api/pdp/images/batch/route.ts" },
  { 이름: "리디자인", path: "app/api/redesign/generate/route.ts" },
];

describe("원가를 남기는가", () => {
  for (const { 이름, path } of 그림을_만드는_자리) {
    it(`${이름}`, () => {
      const source = read(path);
      expect(source, `${path} 가 billableImages 를 안 넘긴다`).toContain("billableImages");

      // 모델은 `model: x` 로도, 축약 `{ model, ... }` 로도 넘긴다. 둘 다 받는다.
      expect(source, `${path} 가 model 을 안 넘긴다`).toMatch(/\{\s*model[,:][\s\S]{0,600}billableImages/);
    });
  }
});

describe("실패도 적는가", () => {
  /**
   * 전에는 `billableImages > 0` 일 때만 적었다. 그래서 실패한 요청은 모델도
   * 장수도 빈 채로 남았고, 「낭비」가 언제나 $0 이었다 — 실패가 다섯 건인데도.
   * 낭비가 안 보이면 줄일 수도 없다.
   */
  it("0장이어도 기록을 남긴다", () => {
    const api = read("lib/membership/api.ts");

    expect(api).not.toContain("if (cost && cost.billableImages > 0) {");
    expect(api).toMatch(/if \(cost\) \{[\s\S]{0,400}billable_images: cost\.billableImages/);
  });

  it("기록이 실패하면 조용히 넘어가지 않는다", () => {
    // 장부를 손으로 메우려면 어느 요청인지가 남아 있어야 한다.
    expect(read("lib/membership/api.ts")).toContain('logUsageFailure("비용 기록 실패"');
  });
});
