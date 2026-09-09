import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **장부를 못 닫았다고 사용자가 만든 것을 잃으면 안 된다.**
 *
 * `finalizeAiUsage` 는 RPC 가 흔들리면 던진다. 그 호출이 성공 경로의 `try` 안에
 * 있으면 이미 만들어 낸 결과가 catch 로 빨려 들어가 「생성 실패」로 둔갑하고,
 * 사용자는 다시 눌러 돈을 또 쓴다. 배치는 더 나빠서, `try` 밖에 있던 호출이
 * 던지면 이미 값을 치른 이미지 전부가 본문 없는 500 과 함께 사라졌다.
 *
 * 포스터와 카드뉴스는 같은 자리를 이미 감싸 두었다 — pdp 네 라우트만 빠져 있었다.
 */
const api = readFileSync(new URL("../../../../lib/membership/api.ts", import.meta.url), "utf8");
const analyze = readFileSync(new URL("../analyze/route.ts", import.meta.url), "utf8");
const images = readFileSync(new URL("../images/route.ts", import.meta.url), "utf8");
const keyVisual = readFileSync(new URL("../key-visual/route.ts", import.meta.url), "utf8");
const batch = readFileSync(new URL("../images/batch/route.ts", import.meta.url), "utf8");

describe("확정을 감싸는 자리가 한 곳인가", () => {
  it("던지지 않는 갈래가 있다", () => {
    expect(api).toContain("export async function settleAiUsage(");
    expect(api).toMatch(/settleAiUsage[\s\S]{0,600}catch \{[\s\S]{0,200}return undefined;/);
  });
});

describe("성공 경로가 그것을 쓰는가", () => {
  it("분석", () => {
    expect(analyze).toContain("await settleAiUsage(reservation, true, 0)");
  });

  it("섹션 이미지", () => {
    // 장수는 `imageCreditUnits` 가 센다. 여기서 보는 것은 확정이 던지지 않는
    // 갈래를 타는지 하나뿐이다.
    expect(images).toContain("await settleAiUsage(reservation, true, imageCreditUnits(model, 1), undefined, {");
  });

  it("대표 이미지", () => {
    expect(keyVisual).toContain("await settleAiUsage(reservation, true, 1, undefined, {");
  });

  it("배치 — 여기는 try 밖이라 던지면 전부 잃는다", () => {
    expect(batch).toContain("const usage = await settleAiUsage(");
    expect(batch).not.toContain("await finalizeAiUsage(");
  });
});

describe("배치 입력 검증", () => {
  it("섹션 모양이 아니면 400 이다 — 500 이 아니다", () => {
    // `{"sections":[null]}` 이 `rejectIfUnverified` 안에서 던져 500 이 났다.
    expect(batch).toContain('if (sections.some((section) => !section || typeof section !== "object"))');
  });
});
