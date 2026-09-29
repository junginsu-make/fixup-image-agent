import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **힙 상한 < MemoryHigh < MemoryMax < 램.** 셋이 어긋나면 서버가 반복해서 다시 뜨거나
 * (힙보다 MemoryMax 가 작다) 커널이 서버 전체를 죽인다(MemoryMax 가 램을 넘는다).
 * 2026-09-28 측정: 힙 512MB 에서 상세페이지 10명 동시로 죽었다.
 */
const root = join(__dirname, "..", "..", "..", "..");
const unit = readFileSync(join(root, "deploy/ec2/fixup-image-agent.service"), "utf8");
const env = readFileSync(join(root, "deploy/ec2/app.env.example"), "utf8");
const mb = (text: string, key: string) => {
  const match = text.match(new RegExp(`^${key}=(\\d+)M$`, "m"));
  if (!match) throw new Error(`${key} 가 없다`);
  return Number(match[1]);
};
const T3_MEDIUM_MB = 3800; // 4GiB 중 커널·Caddy 몫을 뺀 값

describe("메모리 상한", () => {
  it("유닛에 MemoryHigh·MemoryMax 가 있다", () => {
    expect(mb(unit, "MemoryHigh")).toBeGreaterThan(0);
    expect(mb(unit, "MemoryMax")).toBeGreaterThan(0);
  });

  it("힙 상한 < MemoryHigh < MemoryMax < 램", () => {
    const heap = Number(env.match(/^NODE_OPTIONS=--max-old-space-size=(\d+)$/m)?.[1]);
    expect(heap).toBeGreaterThan(512);
    expect(heap).toBeLessThan(mb(unit, "MemoryHigh"));
    expect(mb(unit, "MemoryHigh")).toBeLessThan(mb(unit, "MemoryMax"));
    expect(mb(unit, "MemoryMax")).toBeLessThan(T3_MEDIUM_MB);
  });

  it("감시 메일 받을 주소 칸이 있다", () => {
    expect(env).toMatch(/^ALERT_EMAIL=/m);
  });
});
