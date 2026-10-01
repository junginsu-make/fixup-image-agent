import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **DB 길이 마이그레이션의 함수 이름·인자 이름과 같은가.** RPC 는 이름이 하나라도 틀리면 운영에서야
 * 「함수 없음」으로 드러난다(42883). 마이그레이션 글에서 인자 이름을 읽어 맞춰 본다.
 */
const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcData: unknown = null;
const queries: string[] = [];
const fake = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return { data: rpcData, error: null };
  },
  from: (table: string) => {
    queries.push(`from ${table}`);
    const chain = {
      select: (columns: string) => { queries.push(`select ${columns}`); return chain; },
      is: (column: string, value: unknown) => { queries.push(`is ${column} ${String(value)}`); return Promise.resolve({ data: [], error: null }); },
      eq: (column: string, value: unknown) => { queries.push(`eq ${column} ${String(value)}`); return chain; },
      maybeSingle: async () => ({ data: { account_id: "acct-1" }, error: null }),
    };
    return chain;
  },
};
vi.mock("../../../supabase/admin", () => ({ createSupabaseAdminClient: () => fake }));

const { supabaseFalPoolStore } = await import("../store");

const migration = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "..", "supabase", "migrations", "202610010001_fal_account_pool.sql"), "utf8");
function paramsOf(fn: string): string[] {
  const match = new RegExp(String.raw`create or replace function public\.${fn}\(([^)]*)\)`).exec(migration);
  if (!match) throw new Error(`${fn} 가 마이그레이션에 없습니다`);
  return [...match[1]!.matchAll(/\b(p_\w+)/g)].map((m) => m[1]!);
}

beforeEach(() => {
  calls.length = 0;
  queries.length = 0;
  rpcData = null;
});

describe("supabaseFalPoolStore", () => {
  const store = supabaseFalPoolStore();

  it.each([
    ["claim", () => store.claim("fal-ai/x", ["a"]), "fal_account_claim"],
    ["bind", () => store.bind(7, "req-1"), "fal_request_bind"],
    ["release", () => store.release(7), "fal_request_release"],
    ["finish", () => store.finish("req-1"), "fal_request_finish"],
    ["mark", () => store.mark("acct", "locked", "x"), "fal_account_mark"],
  ] as const)("%s 는 %s 를 마이그레이션의 인자 이름 그대로 부른다", async (_name, run, fn) => {
    await run();
    expect(calls[0]!.fn).toBe(fn);
    expect(Object.keys(calls[0]!.args).sort()).toEqual(paramsOf(fn).sort());
  });

  it("칸 잡기는 첫 행을 숫자 칸 번호로 돌려주고, 없으면 null", async () => {
    rpcData = [{ slot_id: "12", account_id: "acct-1" }];
    expect(await store.claim("e", [])).toEqual({ slotId: 12, accountId: "acct-1" });
    rpcData = [];
    expect(await store.claim("e", [])).toBeNull();
  });

  it("표시는 DB 가 참을 줄 때만 참", async () => {
    rpcData = true;
    expect(await store.mark("a", "invalid", "")).toBe(true);
    rpcData = false;
    expect(await store.mark("a", "invalid", "")).toBe(false);
  });

  it("목록은 지우지 않은 계정만, 암호문 칸까지 읽는다(서버 안에서만 푼다)", async () => {
    await store.liveAccounts();
    expect(queries).toEqual(["from fal_accounts", "select id,name,enabled,state,key_ciphertext,key_iv,key_tag", "is deleted_at null"]);
  });

  it("요청 번호로 계정을 찾는다", async () => {
    expect(await store.accountOf("req-9")).toBe("acct-1");
    expect(queries).toEqual(["from fal_requests", "select account_id", "eq fal_request_id req-9"]);
  });
});
