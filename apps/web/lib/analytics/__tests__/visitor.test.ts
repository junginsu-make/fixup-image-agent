import { describe, expect, it, vi } from "vitest";

/**
 * **하루 방문자 값**(계획 2026-10-06 site-analytics, 보안 검토 반영).
 * 재는 것: 한국 날짜가 같으면 같은 값, 바뀌면 다른 값 / IP·브라우저가 다르면 다른 값 / 값에 원래 IP·브라우저 정보가 없다.
 */
vi.mock("server-only", () => ({}));

const { koreanDay, visitorHash } = await import("../visitor");

const IP = "203.0.113.7";
const UA = "Mozilla/5.0 UNIQUE-UA";

describe("koreanDay", () => {
  it("UTC 15시 이후는 한국으로 다음 날", () => {
    expect(koreanDay(new Date("2026-10-06T15:30:00Z"))).toBe("2026-10-07");
    expect(koreanDay(new Date("2026-10-06T14:59:00Z"))).toBe("2026-10-06");
  });
});

describe("visitorHash", () => {
  it("소문자 16진수 64자", () => {
    expect(visitorHash(IP, UA, new Date("2026-10-06T01:00:00Z"))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("같은 한국 날짜 안에서는 UTC 날짜가 달라도 같은 값", () => {
    const a = visitorHash(IP, UA, new Date("2026-10-05T23:50:00Z"));
    const b = visitorHash(IP, UA, new Date("2026-10-06T00:10:00Z"));
    expect(a).toBe(b);
  });

  it("한국 날짜가 바뀌면 다른 값", () => {
    const a = visitorHash(IP, UA, new Date("2026-10-06T14:59:00Z"));
    const b = visitorHash(IP, UA, new Date("2026-10-06T15:01:00Z"));
    expect(a).not.toBe(b);
  });

  it("IP 가 다르면, 브라우저 정보가 다르면 다른 값", () => {
    const now = new Date("2026-10-06T01:00:00Z");
    const base = visitorHash(IP, UA, now);
    expect(visitorHash("198.51.100.9", UA, now)).not.toBe(base);
    expect(visitorHash(IP, "other-UA", now)).not.toBe(base);
    expect(visitorHash(null, UA, now)).not.toBe(base);
  });

  it("값에 원래 IP·브라우저 정보가 들어 있지 않다", () => {
    const value = visitorHash(IP, UA, new Date("2026-10-06T01:00:00Z"));
    expect(value).not.toContain(IP);
    expect(value).not.toContain("UNIQUE-UA");
  });
});
