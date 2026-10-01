import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { FalHttpError } from "../../http";
import type { FalPoolAlert } from "../alert";
import { sealFalKey } from "../key-crypto";
import { FalPoolBusyError, accountFailureOf, createPoolRouter } from "../router";
import type { FalAccountRow, FalAccountState, FalPoolStore } from "../store";

/**
 * **계정 풀 고르기·옮기기**(보충 2026-10-01). DB 함수(`fal_account_claim`)의 규칙은 PG 시험이 잰다 —
 * 여기는 그 규칙을 메모리로 흉내 낸 가게로, 라우터가 **무엇을 언제 부르는지**를 잰다.
 */

const 열쇠 = randomBytes(32);
const A = "a1000000-0000-4000-8000-00000000000a";
const B = "a1000000-0000-4000-8000-00000000000b";

interface FakeAccount { id: string; name: string; key: string; enabled: boolean; state: FalAccountState; limit: number; sealedFor?: string }

function 가게(accounts: FakeAccount[]) {
  let nextSlot = 1;
  const slots = new Map<number, { accountId: string; requestId: string | null; finished: boolean }>();
  const calls: string[] = [];
  const marks: Array<[string, string]> = [];
  const open = (id: string) => [...slots.values()].filter((s) => s.accountId === id && !s.finished).length;
  const store: FalPoolStore = {
    async liveAccounts() {
      calls.push("liveAccounts");
      return accounts.map((a): FalAccountRow => {
        const sealed = sealFalKey(열쇠, a.sealedFor ?? a.id, a.key);
        return { id: a.id, name: a.name, enabled: a.enabled, state: a.state, key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
      });
    },
    async claim(_endpoint, exclude) {
      calls.push(`claim:${exclude.join(",")}`);
      const pick = accounts
        .filter((a) => a.enabled && !["locked", "invalid", "decrypt_failed"].includes(a.state) && !exclude.includes(a.id) && open(a.id) < a.limit)
        .sort((x, y) => (y.limit - open(y.id)) - (x.limit - open(x.id)))[0];
      if (!pick) return null;
      const slotId = nextSlot++;
      slots.set(slotId, { accountId: pick.id, requestId: null, finished: false });
      return { slotId, accountId: pick.id };
    },
    async bind(slotId, requestId) { calls.push(`bind:${requestId}`); slots.get(slotId)!.requestId = requestId; },
    async release(slotId) { calls.push(`release:${slotId}`); slots.delete(slotId); },
    async finish(requestId) {
      calls.push(`finish:${requestId}`);
      for (const s of slots.values()) if (s.requestId === requestId) s.finished = true;
    },
    async accountOf(requestId) {
      calls.push(`accountOf:${requestId}`);
      return [...slots.values()].find((s) => s.requestId === requestId)?.accountId ?? null;
    },
    async mark(id, kind) {
      marks.push([id, kind]);
      const account = accounts.find((a) => a.id === id)!;
      const changed = account.state !== kind;
      account.state = kind;
      return changed;
    },
  };
  return { store, calls, marks, slots, open };
}

/** 키마다 fal 의 답을 정해 둔 가짜 제출. */
function fal(answers: Record<string, () => string | FalHttpError>) {
  const seen: string[] = [];
  let n = 0;
  const submit = async (key: string) => {
    seen.push(key);
    const answer = (answers[key] ?? (() => `req-${key}-${++n}`))();
    if (answer instanceof FalHttpError) throw answer;
    return answer;
  };
  return { seen, submit };
}

let alerts: FalPoolAlert[] = [];
beforeEach(() => { alerts = []; });

const 만들기 = (store: FalPoolStore, submit: ReturnType<typeof fal>["submit"], environment: Record<string, string> = { FAL_KEY: "env-key" }) =>
  createPoolRouter({ store, masterKey: 열쇠, environment, alert: (e) => { alerts.push(e); }, submit, log: () => {} });

const 계정 = (id: string, key: string, extra: Partial<FakeAccount> = {}): FakeAccount =>
  ({ id, name: `fal-${id.slice(-1)}`, key, enabled: true, state: "ok", limit: 20, ...extra });

describe("어느 계정으로 보내나", () => {
  it("계정이 하나도 없으면 서버 FAL_KEY 로 — 칸을 잡지 않는다(오늘과 같다)", async () => {
    const g = 가게([]);
    const f = fal({});
    const out = await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(f.seen).toEqual(["env-key"]);
    expect(out.route).toEqual({ accountId: null, key: "env-key" });
    expect(g.calls).toEqual(["liveAccounts"]);
  });

  it("켜진 계정이 없으면(다 꺼짐) 서버 FAL_KEY 로", async () => {
    const g = 가게([계정(A, "key-a", { enabled: false })]);
    const f = fal({});
    await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(f.seen).toEqual(["env-key"]);
  });

  it("켜진 계정이 있으면 그 계정 키로 보내고 받은 번호를 붙인다", async () => {
    const g = 가게([계정(A, "key-a")]);
    const f = fal({ "key-a": () => "req-1" });
    const out = await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(out).toEqual({ requestId: "req-1", route: { accountId: A, key: "key-a" } });
    expect(g.calls).toContain("bind:req-1");
  });

  it("**한 계정이 429 면 같은 제출을 곧바로 다음 계정으로** — 사용자는 모른다, 메일은 없다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
    const f = fal({ "key-a": () => new FalHttpError(429, "rate limited"), "key-b": () => "req-b" });
    const out = await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(f.seen).toEqual(["key-a", "key-b"]);
    expect(out.route.accountId).toBe(B);
    expect(g.marks).toEqual([[A, "rate_limited"]]);
    expect(g.calls).toContain(`claim:${A}`);
    expect(g.calls.filter((c) => c.startsWith("release:"))).toHaveLength(1);
    expect(alerts).toEqual([]);
  });

  it("잔액 소진(403 locked)·키 오류(401)는 다음 계정으로 옮기고 관리자 메일 — 같은 사건은 한 번", async () => {
    const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
    const f = fal({ "key-a": () => new FalHttpError(403, '{"detail":"User is locked. Reason: Exhausted balance."}') });
    const router = 만들기(g.store, f.submit);
    await router.submit("fal-ai/x", {});
    await router.submit("fal-ai/x", {});
    expect(g.marks).toEqual([[A, "locked"]]);
    expect(alerts).toEqual([expect.objectContaining({ kind: "locked", accountName: "fal-a" })]);
    expect(f.seen).toEqual(["key-a", "key-b", "key-b"]);
  });

  it("다른 프로세스가 먼저 표시했으면(이번에 바뀐 것이 아니면) 메일을 또 보내지 않는다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
    g.store.mark = async () => false;
    await 만들기(g.store, fal({ "key-a": () => new FalHttpError(403, "User is locked") }).submit).submit("fal-ai/x", {});
    expect(alerts).toEqual([]);
  });

  it("401 은 키 오류로 적는다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
    await 만들기(g.store, fal({ "key-a": () => new FalHttpError(401, "invalid key credentials") }).submit).submit("fal-ai/x", {});
    expect(g.marks).toEqual([[A, "invalid"]]);
    expect(alerts[0]!.kind).toBe("invalid");
  });

  it("모든 계정이 차면 「잠시 뒤 다시」(429) — 서버 키로 새지 않는다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 1 })]);
    const f = fal({});
    const router = 만들기(g.store, f.submit);
    await router.submit("fal-ai/x", {});
    const error = await router.submit("fal-ai/x", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FalPoolBusyError);
    expect(error).toMatchObject({ status: 429, message: "지금 이미지 생성이 몰려 있습니다. 잠시 뒤 다시 시도해 주세요." });
    expect(f.seen).toEqual(["key-a"]);
  });

  it("모든 계정이 거절하면 「잠시 뒤 다시」", async () => {
    const g = 가게([계정(A, "key-a"), 계정(B, "key-b")]);
    const busy = () => new FalHttpError(429, "busy");
    await expect(만들기(g.store, fal({ "key-a": busy, "key-b": busy }).submit).submit("fal-ai/x", {})).rejects.toBeInstanceOf(FalPoolBusyError);
  });

  it("내용 거절(422)·fal 장애(500)는 옮기지 않고 그대로 던진다 — 두 번 과금될 수 있다", async () => {
    for (const status of [422, 500]) {
      const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
      const f = fal({ "key-a": () => new FalHttpError(status, "no") });
      await expect(만들기(g.store, f.submit).submit("fal-ai/x", {})).rejects.toMatchObject({ status });
      expect(f.seen).toEqual(["key-a"]);
      expect(g.marks).toEqual([]);
      expect(g.calls.filter((c) => c.startsWith("release:"))).toHaveLength(1);
    }
  });

  it("**키를 풀 수 없는 계정은 빼고** 표시·메일 — 다른 계정이 없으면 서버 키로", async () => {
    const g = 가게([계정(A, "key-a", { sealedFor: B })]);
    const f = fal({});
    await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(g.marks).toEqual([[A, "decrypt_failed"]]);
    expect(alerts[0]!.kind).toBe("decrypt_failed");
    expect(f.seen).toEqual(["env-key"]);
  });
});

describe("보낸 요청은 보낸 계정으로 묻는다", () => {
  it("같은 프로세스는 메모리로, 다시 띄운 뒤에는 DB 기록으로 같은 계정을 찾는다", async () => {
    const g = 가게([계정(A, "key-a")]);
    const f = fal({ "key-a": () => "req-1" });
    await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    const restarted = 만들기(g.store, f.submit);
    expect(await restarted.routeOf("req-1")).toEqual({ accountId: A, key: "key-a" });
    expect(g.calls).toContain("accountOf:req-1");
  });

  it("번호를 DB 에 못 붙여도(세 번 실패) 같은 프로세스는 메모리로 같은 계정을 찾는다", async () => {
    const g = 가게([계정(A, "key-a")]);
    g.store.bind = async () => { throw new Error("db down"); };
    const router = 만들기(g.store, fal({ "key-a": () => "req-1" }).submit);
    await router.submit("fal-ai/x", {});
    expect(await router.routeOf("req-1")).toEqual({ accountId: A, key: "key-a" });
  });

  it("**계정을 꺼도** 진행 중 요청은 그 계정 키로 계속 묻는다", async () => {
    const accounts = [계정(A, "key-a"), 계정(B, "key-b", { limit: 5 })];
    const g = 가게(accounts);
    const f = fal({ "key-a": () => "req-a" });
    const router = 만들기(g.store, f.submit);
    await router.submit("fal-ai/x", {});
    accounts[0]!.enabled = false;
    router.refresh();
    expect((await 만들기(g.store, f.submit).routeOf("req-a")).key).toBe("key-a");
  });

  it("기록이 없는 옛 요청(풀 이전)은 서버 FAL_KEY 로 묻는다", async () => {
    const g = 가게([계정(A, "key-a")]);
    expect(await 만들기(g.store, fal({}).submit).routeOf("old-req")).toEqual({ accountId: null, key: "env-key" });
  });

  it("계정 행이 아예 없으면 DB 를 보지 않는다", async () => {
    const g = 가게([]);
    await 만들기(g.store, fal({}).submit).routeOf("old-req");
    expect(g.calls).toEqual(["liveAccounts"]);
  });

  it("끝나면 진행 중에서 뺀다 — 서버 키 요청은 DB 를 부르지 않는다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 1 })]);
    const f = fal({ "key-a": () => "req-1" });
    const router = 만들기(g.store, f.submit);
    await router.submit("fal-ai/x", {});
    router.finished("req-1");
    await Promise.resolve();
    expect(g.open(A)).toBe(0);

    const empty = 가게([]);
    const envRouter = 만들기(empty.store, fal({}).submit);
    const { requestId } = await envRouter.submit("fal-ai/x", {});
    envRouter.finished(requestId);
    expect(empty.calls).toEqual(["liveAccounts"]);
  });
});

describe("고침 1차 — 막힌 계정은 캐시에도 바로 반영한다", () => {
  it("401 뒤에는 그 계정을 캐시에서도 막아 uploadRoute 가 다른 계정을 쓴다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
    const router = 만들기(g.store, fal({ "key-a": () => new FalHttpError(401, "invalid key credentials") }).submit);
    await router.submit("fal-ai/x", {});
    const route = await router.uploadRoute();
    expect(route.accountId).toBe(B);
  });

  it("남은 계정이 없으면 uploadRoute 도 서버 FAL_KEY 로 — 방금 막힌 계정을 또 주지 않는다", async () => {
    const g = 가게([계정(A, "key-a")]);
    const router = 만들기(g.store, fal({ "key-a": () => new FalHttpError(401, "invalid key credentials") }).submit);
    await router.submit("fal-ai/x", {}).catch(() => undefined);
    expect(await router.uploadRoute()).toEqual({ accountId: null, key: "env-key" });
  });
});

describe("고침 2차 — refresh() 와 겹친 낡은 적재는 캐시에 남지 않는다", () => {
  it("refresh() 뒤에 늦게 끝난 적재는 버리고, 다음 제출은 새로 읽는다", async () => {
    let release: (rows: FalAccountRow[]) => void = () => {};
    let calls = 0;
    const rowOf = (key: string): FalAccountRow => {
      const sealed = sealFalKey(열쇠, A, key);
      return { id: A, name: "fal-a", enabled: true, state: "ok", key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
    };
    const store: FalPoolStore = {
      liveAccounts: () => {
        calls += 1;
        if (calls === 1) return new Promise((resolve) => { release = resolve; });
        return Promise.resolve([rowOf("key-new")]);
      },
      claim: async () => ({ slotId: 1, accountId: A }),
      bind: async () => {},
      release: async () => {},
      finish: async () => {},
      accountOf: async () => null,
      mark: async () => false,
    };
    const f = fal({ "key-old": () => "req-old", "key-new": () => "req-new" });
    const router = 만들기(store, f.submit);

    const first = router.submit("fal-ai/x", {});
    router.refresh();
    release([rowOf("key-old")]);
    await first;

    const second = await router.submit("fal-ai/x", {});
    expect(calls).toBe(2);
    expect(second.route.key).toBe("key-new");
  });
});

describe("고침 3차 — 이미 decrypt_failed 인 계정은 다시 표시하지 않는다", () => {
  it("매번 적재할 때마다 표시·메일을 또 보내지 않는다", async () => {
    const g = 가게([계정(A, "key-a", { sealedFor: B, state: "decrypt_failed" })]);
    const f = fal({});
    await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(g.marks).toEqual([]);
    expect(alerts).toEqual([]);
    expect(f.seen).toEqual(["env-key"]);
  });
});

describe("고침 4차 — 계정 목록을 못 읽어도 생성은 계속된다", () => {
  it("한 번도 읽은 적이 없는데 DB 가 죽으면 서버 FAL_KEY 로 — 새 하드 의존을 만들지 않는다", async () => {
    const store: FalPoolStore = {
      liveAccounts: async () => { throw new Error("db unreachable"); },
      claim: async () => null,
      bind: async () => {},
      release: async () => {},
      finish: async () => {},
      accountOf: async () => null,
      mark: async () => false,
    };
    const f = fal({});
    const out = await 만들기(store, f.submit).submit("fal-ai/x", {});
    expect(f.seen).toEqual(["env-key"]);
    expect(out.route).toEqual({ accountId: null, key: "env-key" });
  });

  it("한 번 읽은 뒤 DB 가 끊겨도 이전에 읽은 목록을 그대로 쓴다", async () => {
    const g = 가게([계정(A, "key-a")]);
    let fail = false;
    let liveCalls = 0;
    const original = g.store.liveAccounts.bind(g.store);
    g.store.liveAccounts = async () => {
      liveCalls += 1;
      if (fail) throw new Error("db down");
      return original();
    };
    const f = fal({ "key-a": () => "req-1" });
    const router = 만들기(g.store, f.submit);
    await router.submit("fal-ai/x", {});

    fail = true;
    router.refresh();
    const out = await router.submit("fal-ai/x", {});

    expect(liveCalls).toBe(2);
    expect(out.route).toEqual({ accountId: A, key: "key-a" });
  });
});

describe("accountFailureOf", () => {
  it("429·401·403 만 계정 탓이다", () => {
    expect(accountFailureOf(new FalHttpError(429, ""))).toBe("rate_limited");
    expect(accountFailureOf(new FalHttpError(401, ""))).toBe("invalid");
    expect(accountFailureOf(new FalHttpError(403, "User is locked. Reason: Exhausted balance"))).toBe("locked");
    expect(accountFailureOf(new FalHttpError(403, "Forbidden"))).toBe("invalid");
    expect(accountFailureOf(new FalHttpError(422, ""))).toBeNull();
    expect(accountFailureOf(new FalHttpError(503, ""))).toBeNull();
    expect(accountFailureOf(new Error("fetch failed"))).toBeNull();
  });
});
