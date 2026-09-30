import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **포스터 기획은 값이 나가기 전에 자리를 잡는다**(설계 2026-09-30 §3.1, D5).
 *
 * 전에는 붙인 그림을 비전 모델로 다 읽은 **뒤에** 예약했다(읽은 장 수로 값을 세려고).
 * 그러면 크레딧 없는 회원이 거절되기 전에 돈이 나간다. 이제 「읽을 그림 수」로 먼저
 * 세고 예약한 다음 읽는다. 읽을 목록은 두 목록을 합쳐 **중복만** 거른다.
 */
const source = readFileSync(new URL("../projects/[id]/plan/route.ts", import.meta.url), "utf8");

describe("포스터 기획의 예약 순서", () => {
  it("예약이 그림 읽기보다 먼저다", () => {
    const 예약 = source.indexOf("reserveAiUsage(");
    const 읽기 = source.indexOf("readAttachments(");
    expect(예약).toBeGreaterThan(0);
    expect(읽기).toBeGreaterThan(0);
    expect(예약).toBeLessThan(읽기);
  });

  it("막히면 읽지 않고 돌아간다", () => {
    expect(source).toContain("if (!reserved.ok) return reserved.response;");
  });

  it("예약 장수는 읽을 그림 수로 센다", () => {
    expect(source).toContain("visionReads: 읽을것.length");
  });

  it("두 목록을 합쳐 중복만 거른다", () => {
    expect(source).toMatch(/uniqueById\(\s*\[\.\.\.references, \.\.\.preserved\]/);
    expect(source).toMatch(/readAttachments\(\s*읽을것/);
  });
});
