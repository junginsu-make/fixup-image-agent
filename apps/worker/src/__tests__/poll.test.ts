import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_POLLS_PER_USER_PER_HOUR,
  claimDueSources,
  nextPollAt,
  nextRateWindow,
  pollOnce,
} from "../poll";

const source = (patch: Record<string, unknown> = {}) => ({
  id: "s1", userId: "u1", kind: "rss" as const, name: "테스트",
  url: "https://example.com/feed", intervalHours: 6, enabled: true, config: {},
  lastCheckedAt: null, nextPollAt: "2026-08-31T00:00:00Z", leaseUntil: null, lastError: null,
  ...patch,
});

describe("다음 확인 시각", () => {
  it("주기만큼 뒤로 민다", () => {
    expect(nextPollAt(new Date("2026-08-31T00:00:00Z"), 6))
      .toEqual(new Date("2026-08-31T06:00:00Z"));
  });

  it("시간당 상한의 다음 창은 다음 정각이다", () => {
    expect(nextRateWindow(new Date("2026-08-31T01:15:00Z")))
      .toEqual(new Date("2026-08-31T02:00:00Z"));
  });
});

describe("리스", () => {
  it("조건부 리스를 얻은 소스만 돌려준다", async () => {
    const attempts: Array<{ id: string; leaseUntil: Date }> = [];
    const claimed = await claimDueSources(new Date("2026-08-31T01:00:00Z"), {
      listDue: async () => [source({ id: "s1" }), source({ id: "s2" })],
      claimLease: async (entry, _now, leaseUntil) => {
        attempts.push({ id: entry.id, leaseUntil });
        return entry.id === "s1" ? entry : undefined;
      },
    });

    expect(claimed.map((entry) => entry.id)).toEqual(["s1"]);
    expect(attempts[0]!.leaseUntil).toEqual(new Date("2026-08-31T01:10:00Z"));
  });
});

describe("한 번 돌기", () => {
  it("수집한 후보를 저장하고 다음 시각을 민다", async () => {
    const saved: unknown[] = [];
    const result = await pollOnce({
      now: new Date("2026-08-31T01:00:00Z"),
      claimDue: async () => [source()],
      fetchFor: async () => [{ externalId: "a1", title: "글", url: "u", body: "본문" }],
      saveCandidates: async (rows) => { saved.push(...rows); return rows.length; },
      markChecked: async () => undefined,
      markFailed: async () => undefined,
    });
    expect(result).toEqual({ checked: 1, collected: 1, failed: 0 });
    expect(saved).toHaveLength(1);
  });

  it("한 소스가 실패해도 나머지는 계속한다", async () => {
    const failures: string[] = [];
    const result = await pollOnce({
      now: new Date("2026-08-31T01:00:00Z"),
      claimDue: async () => [source({ id: "s1" }), source({ id: "s2" })],
      fetchFor: async (entry) => {
        if (entry.id === "s1") throw new Error("차단됨");
        return [{ externalId: "b1", title: "글2", url: "u2" }];
      },
      saveCandidates: async (rows) => rows.length,
      markChecked: async () => undefined,
      markFailed: async (id, message) => { failures.push(`${id}:${message}`); },
    });
    expect(result).toEqual({ checked: 2, collected: 1, failed: 1 });
    expect(failures).toEqual(["s1:차단됨"]);
  });

  it("실패 기록 저장이 실패해도 다음 소스를 계속한다", async () => {
    const surfaced: string[] = [];
    const result = await pollOnce({
      now: new Date("2026-08-31T01:00:00Z"),
      claimDue: async () => [source({ id: "s1" }), source({ id: "s2" })],
      fetchFor: async (entry) => {
        if (entry.id === "s1") throw new Error("수집 실패");
        return [{ externalId: "b1", title: "글2", url: "u2" }];
      },
      saveCandidates: async (rows) => rows.length,
      markChecked: async () => undefined,
      markFailed: async () => { throw new Error("DB 기록 실패"); },
      reportError: (message) => surfaced.push(message),
    });

    expect(result).toEqual({ checked: 2, collected: 1, failed: 1 });
    expect(surfaced[0]).toContain("DB 기록 실패");
  });

  it("시간당 상한을 넘으면 fetch 하지 않고 이유를 남긴다", async () => {
    const fetchFor = vi.fn();
    const failures: Array<{ message: string; next: Date }> = [];
    const result = await pollOnce({
      now: new Date("2026-08-31T01:15:00Z"),
      claimDue: async () => [source()],
      claimUserSlot: async () => false,
      fetchFor,
      saveCandidates: async () => 0,
      markChecked: async () => undefined,
      markFailed: async (_id, message, next) => { failures.push({ message, next }); },
    });

    expect(fetchFor).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, collected: 0, failed: 1 });
    expect(failures[0]!.message).toContain(String(DEFAULT_MAX_POLLS_PER_USER_PER_HOUR));
    expect(failures[0]!.next).toEqual(new Date("2026-08-31T02:00:00Z"));
  });

  it("가져올 것이 없으면 아무 일도 하지 않는다", async () => {
    const result = await pollOnce({
      now: new Date(), claimDue: async () => [],
      fetchFor: async () => { throw new Error("불려서는 안 된다"); },
      saveCandidates: async () => 0, markChecked: async () => undefined, markFailed: async () => undefined,
    });
    expect(result).toEqual({ checked: 0, collected: 0, failed: 0 });
  });
});
