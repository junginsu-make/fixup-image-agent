import { describe, expect, it, vi } from "vitest";
import { purgeCutoff, runPurge, type PurgeItem, type PurgeTarget } from "../purge-deleted";

/**
 * **회원이 지운 것은 6개월 뒤 저절로 완전히 지운다**(2026-10-08 사용자 결정 — 계획 3단계).
 *
 * 하루 한 번 서버 타이머가 부른다. 한 번에 갈래마다 정해진 수만 지운다 — 서버 램이 작다(911MB). 하나가 실패해도
 * 나머지는 계속 지우고, 몇 건 지웠는지·실패했는지 기록한다.
 */
describe("6개월 기준", () => {
  it("달력으로 6개월 전이다", () => {
    expect(purgeCutoff(new Date("2027-04-09T03:00:00.000Z")).toISOString()).toBe("2026-10-09T03:00:00.000Z");
  });

  /** `setUTCMonth` 는 달말에 넘친다 — 8월 31일의 6개월 전이 3월 3일이 되면 6개월을 안 채우고 지운다(리뷰). */
  it("달말은 그 달 마지막 날로 맞춘다 — 6개월을 덜 채우고 지우지 않는다", () => {
    expect(purgeCutoff(new Date("2026-08-31T12:00:00.000Z")).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(purgeCutoff(new Date("2028-08-31T00:00:00.000Z")).toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(purgeCutoff(new Date("2027-03-15T00:00:00.000Z")).toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("받은 시각을 바꾸지 않는다", () => {
    const now = new Date("2027-04-09T03:00:00.000Z");
    purgeCutoff(now);
    expect(now.toISOString()).toBe("2027-04-09T03:00:00.000Z");
  });
});

/** 지운 것은 다음 목록에서 빠지는 가짜 갈래. 건너뛸 id 는 목록에서 뺀다. */
function target(kind: PurgeTarget["kind"], items: PurgeItem[], fail: (item: PurgeItem) => boolean = () => false) {
  const purged: string[] = [];
  const list = vi.fn(async (_cutoff: string, limit: number, skip: readonly string[]) =>
    items.filter((item) => !purged.includes(item.id) && !skip.includes(item.id)).slice(0, limit));
  return {
    purged,
    list,
    target: {
      kind,
      list,
      purge: async (item: PurgeItem) => {
        if (fail(item)) throw new Error("저장소 오류");
        purged.push(item.id);
      },
    } satisfies PurgeTarget,
  };
}

describe("파기", () => {
  const now = new Date("2027-04-09T03:00:00.000Z");

  it("갈래마다 6개월 지난 것을 정해진 수까지 묻고 지운다", async () => {
    const sns = target("sns", [{ id: "s1", owner: "u" }, { id: "s2", owner: "u" }]);
    const chars = target("characters", [{ id: "c1", owner: "u" }]);
    const report = await runPurge([sns.target, chars.target], now, 50);
    expect(sns.list).toHaveBeenCalledWith("2026-10-09T03:00:00.000Z", 50, []);
    expect(sns.purged).toEqual(["s1", "s2"]);
    expect(chars.purged).toEqual(["c1"]);
    expect(report).toEqual({ sns: { purged: 2, failed: 0 }, characters: { purged: 1, failed: 0 } });
  });

  it("하나가 실패해도 나머지는 지우고 실패를 센다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refs = target("references", [{ id: "r1", owner: "u" }, { id: "r2", owner: "u" }], (item) => item.id === "r1");
    const easy = target("easy", [{ id: "e1", owner: "u" }]);
    const report = await runPurge([refs.target, easy.target], now, 50);
    expect(refs.purged).toEqual(["r2"]);
    expect(easy.purged).toEqual(["e1"]);
    expect(report).toEqual({ references: { purged: 1, failed: 1 }, easy: { purged: 1, failed: 0 } });
  });

  it("목록을 못 읽은 갈래는 표시하고 다음 갈래로 간다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: PurgeTarget = { kind: "library", list: async () => { throw new Error("표 없음"); }, purge: async () => undefined };
    const pdp = target("pdp", [{ id: "d1", owner: "u" }]);
    const report = await runPurge([broken, pdp.target], now, 50);
    expect(report).toEqual({ library: { purged: 0, failed: 0, listFailed: true }, pdp: { purged: 1, failed: 0 } });
    expect(pdp.purged).toEqual(["d1"]);
  });

  /** 하루에 정해진 수만 지우면 많이 지우는 날 밀린 것이 계속 쌓인다(리뷰) — 시간이 남는 동안 다음 묶음을 잇는다. */
  it("묶음이 꽉 차면 다음 묶음을 이어서 지운다", async () => {
    const lib = target("library", Array.from({ length: 5 }, (_, index) => ({ id: `l${index}`, owner: "u" })));
    const report = await runPurge([lib.target], now, 2);
    expect(lib.purged).toEqual(["l0", "l1", "l2", "l3", "l4"]);
    expect(report).toEqual({ library: { purged: 5, failed: 0 } });
  });

  /** 늘 실패하는 것이 맨 앞에 쌓이면 그 갈래가 영영 못 나아간다(리뷰) — 그 회차에서는 건너뛴다. */
  it("실패한 것은 이번 회차에서 건너뛰고 뒤의 것을 지운다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refs = target("references", [{ id: "bad", owner: "u" }, { id: "r1", owner: "u" }, { id: "r2", owner: "u" }],
      (item) => item.id === "bad");
    const report = await runPurge([refs.target], now, 1);
    expect(refs.purged).toEqual(["r1", "r2"]);
    expect(report).toEqual({ references: { purged: 2, failed: 1 } });
  });

  /** 한 건씩 예산을 본다 — 묶음 사이에서만 보면 타이머 스크립트의 10분 제한을 넘길 수 있다(재리뷰). */
  it("묶음 한가운데서도 시간 예산을 넘기면 멈추고 남았다고 적는다", async () => {
    let clock = 0;
    const lib = target("library", Array.from({ length: 4 }, (_, index) => ({ id: `l${index}`, owner: "u" })));
    const slow = { ...lib.target, purge: async (item: PurgeItem) => { clock += 1000; await lib.target.purge(item); } };
    const report = await runPurge([slow], now, 4, { budgetMs: 1500, clock: () => clock });
    expect(lib.purged).toEqual(["l0", "l1"]);
    expect(report).toEqual({ library: { purged: 2, failed: 0, more: true } });
  });

  it("시간 예산을 넘기면 첫 묶음만 지우고 남았다고 적는다 — 다음 날 이어서", async () => {
    let clock = 0;
    const lib = target("library", Array.from({ length: 4 }, (_, index) => ({ id: `l${index}`, owner: "u" })));
    const slow = { ...lib.target, purge: async (item: PurgeItem) => { clock += 1000; await lib.target.purge(item); } };
    const report = await runPurge([slow], now, 2, { budgetMs: 1500, clock: () => clock });
    expect(lib.purged).toEqual(["l0", "l1"]);
    expect(report).toEqual({ library: { purged: 2, failed: 0, more: true } });
  });

  /** 지웠다고 했는데 줄이 그대로면 같은 것을 예산이 다할 때까지 되풀이한다 — 그 갈래를 멈추고 기록한다. */
  it("지운 것이 다시 나오면 그 갈래를 멈춘다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stuck: PurgeTarget = { kind: "easy", list: async () => [{ id: "e1", owner: "u" }], purge: async () => undefined };
    const report = await runPurge([stuck], now, 1);
    // 지운 수에 넣지 않고 실패로 센다 — 주소가 500 으로 답해 타이머 기록에 실패로 남는다(재리뷰).
    expect(report).toEqual({ easy: { purged: 0, failed: 1, more: true } });
  });
});
