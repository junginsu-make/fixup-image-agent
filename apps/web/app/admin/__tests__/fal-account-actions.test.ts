import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **fal 계정을 바꾸는 문**(보충 2026-10-01).
 *
 * 관리자인지 다시 본다(서버 액션은 주소만 알면 부를 수 있다). 키는 fal 에 무료로 한 번 물어 확인한 뒤
 * **계정 id 를 추가 인증 데이터로 잠가** DB 로 보낸다 — 원문은 RPC 인자에도, 주소(`?error=`)에도 없다.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirected: string[] = [];
vi.mock("next/navigation", () => ({ redirect: (to: string) => { redirected.push(to); } }));

let 관리자다 = true;
vi.mock("../../../lib/membership/server", () => ({
  requireAdmin: async () => {
    if (!관리자다) throw new Error("관리자 권한이 필요합니다.");
    return { user: { id: "admin-1" }, profile: { email: "admin@example.com" } };
  },
}));

const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcError: { message: string; code?: string } | null = null;
let stored: Record<string, string> | null = null;
vi.mock("../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: null, error: rpcError };
    },
    from: () => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: stored, error: null }) }) }) }) }),
  }),
}));

let 확인결과: { ok: true } | { ok: false; reason: "invalid" | "unavailable"; status?: number; detail: string } = { ok: true };
const 확인한키: string[] = [];
vi.mock("../../../lib/fal/http", () => ({
  checkFalKey: async (key: string) => { 확인한키.push(key); return 확인결과; },
}));
const refreshFalPool = vi.fn();
vi.mock("../../../lib/fal/pool/default", () => ({ refreshFalPool: () => refreshFalPool() }));

const { openFalKey, sealFalKey } = await import("../../../lib/fal/pool/key-crypto");
const actions = await import("../system/fal-account-actions");

const 열쇠 = randomBytes(32);
const 키 = "11111111-2222-3333-4444-555555555555:0123456789abcdefWXYZ";
const ID = "a1000000-0000-4000-8000-000000000001";
const 폼 = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
};
const 오류 = () => decodeURIComponent(redirected.at(-1)!.split("error=")[1] ?? "");

beforeEach(() => {
  calls.length = 0;
  redirected.length = 0;
  확인한키.length = 0;
  rpcError = null;
  stored = null;
  관리자다 = true;
  확인결과 = { ok: true };
  refreshFalPool.mockClear();
  process.env.FAL_KEY_ENCRYPTION_SECRET = 열쇠.toString("base64");
});
afterEach(() => { delete process.env.FAL_KEY_ENCRYPTION_SECRET; });

describe("등록", () => {
  it("확인하고, 계정 id 로 잠가 보낸다 — 원문은 RPC 인자 어디에도 없다", async () => {
    await actions.addFalAccountAction(폼({ name: " fal-1 (ai.dev 계정) ", key: `  ${키}\n`, limit: "20" }));
    expect(확인한키).toEqual([키]);
    expect(calls).toHaveLength(1);
    const { fn, args } = calls[0]!;
    expect(fn).toBe("fal_account_add");
    expect(args).toMatchObject({ p_actor: "admin-1", p_name: "fal-1 (ai.dev 계정)", p_last4: "WXYZ", p_limit: 20 });
    expect(JSON.stringify(args)).not.toContain("0123456789abcdef");
    const sealed = { ciphertext: String(args.p_ciphertext), iv: String(args.p_iv), tag: String(args.p_tag) };
    expect(openFalKey(열쇠, String(args.p_id), sealed)).toBe(키);
    expect(refreshFalPool).toHaveBeenCalledOnce();
    expect(redirected).toEqual(["/admin/system?notice=fal_account_added"]);
  });

  it("관리자가 아니면 아무것도 하지 않는다", async () => {
    관리자다 = false;
    await expect(actions.addFalAccountAction(폼({ name: "a", key: 키 }))).rejects.toThrow();
    expect(calls).toEqual([]);
    expect(확인한키).toEqual([]);
  });

  it("fal 이 거절하면 저장하지 않고 까닭을 말한다 — 키는 주소에 싣지 않는다", async () => {
    확인결과 = { ok: false, reason: "invalid", status: 401, detail: "invalid key credentials" };
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    expect(calls).toEqual([]);
    expect(오류()).toBe("fal 이 이 키를 거절했습니다(401). 키를 다시 확인해 주세요.");
    expect(redirected.at(-1)).not.toContain("0123456789");
  });

  it("fal 에 물을 수 없으면 틀렸다고 하지 않고 「잠시 뒤」", async () => {
    확인결과 = { ok: false, reason: "unavailable", status: 503, detail: "" };
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    expect(오류()).toBe("지금 fal 에 키를 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
  });

  it("서버 열쇠가 없으면 저장하지 않는다", async () => {
    delete process.env.FAL_KEY_ENCRYPTION_SECRET;
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    expect(calls).toEqual([]);
    expect(오류()).toContain("FAL_KEY_ENCRYPTION_SECRET");
  });

  it("이름·한도·키 모양을 본다", async () => {
    await actions.addFalAccountAction(폼({ name: "  ", key: 키 }));
    expect(오류()).toBe("이름을 1~80자로 넣어 주세요.");
    await actions.addFalAccountAction(폼({ name: "a", key: 키, limit: "201" }));
    expect(오류()).toBe("동시 한도는 1~200 사이로 넣어 주세요.");
    await actions.addFalAccountAction(폼({ name: "a", key: "short" }));
    expect(오류()).toBe("키 모양이 올바르지 않습니다. fal 에서 복사한 키를 그대로 붙여 넣어 주세요.");
    expect(calls).toEqual([]);
  });

  it("같은 이름이면 사람 말로", async () => {
    rpcError = { message: 'duplicate key value violates unique constraint "fal_accounts_name_live"', code: "23505" };
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    expect(오류()).toBe("같은 이름의 계정이 이미 있습니다.");
  });
});

describe("설정·켜고 끄기", () => {
  it("이름·한도·사용을 한 번에 보낸다", async () => {
    await actions.updateFalAccountAction(폼({ id: ID, name: "fal-2", limit: "30", enabled: "0" }));
    expect(calls).toEqual([{ fn: "fal_account_update", args: { p_actor: "admin-1", p_id: ID, p_name: "fal-2", p_limit: 30, p_enabled: false } }]);
    expect(redirected).toEqual(["/admin/system?notice=fal_account_saved"]);
  });

  it("사용 값은 정확히 '1'/'0' 만", async () => {
    await actions.updateFalAccountAction(폼({ id: ID, name: "a", limit: "20", enabled: "yes" }));
    expect(calls).toEqual([]);
  });
});

describe("키 바꾸기·지우기 — 진행 중이면 DB 가 거절한다", () => {
  it("키 바꾸기는 새 키를 같은 계정 id 로 잠근다", async () => {
    await actions.replaceFalKeyAction(폼({ id: ID, key: 키 }));
    const { fn, args } = calls[0]!;
    expect(fn).toBe("fal_account_set_key");
    expect(openFalKey(열쇠, ID, { ciphertext: String(args.p_ciphertext), iv: String(args.p_iv), tag: String(args.p_tag) })).toBe(키);
  });

  it("진행 중이면 기다리라고 말한다", async () => {
    rpcError = { message: "fal_account_in_flight" };
    await actions.deleteFalAccountAction(폼({ id: ID }));
    expect(오류()).toBe("진행 중인 생성이 끝난 뒤에 할 수 있습니다. 먼저 「사용」을 끄고, 진행 중이 0 이 되면 다시 눌러 주세요.");
    expect(refreshFalPool).not.toHaveBeenCalled();
  });
});

describe("다시 확인", () => {
  it("저장된 키를 풀어 fal 에 묻고 결과를 적는다", async () => {
    const sealed = sealFalKey(열쇠, ID, 키);
    stored = { key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
    await actions.recheckFalAccountAction(폼({ id: ID }));
    expect(확인한키).toEqual([키]);
    expect(calls).toEqual([{ fn: "fal_account_recheck", args: { p_actor: "admin-1", p_id: ID, p_ok: true, p_detail: null } }]);
    expect(redirected).toEqual(["/admin/system?notice=fal_account_checked"]);
  });

  it("거절이면 「키 오류」로 적고 키를 바꾸라고 말한다", async () => {
    const sealed = sealFalKey(열쇠, ID, 키);
    stored = { key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
    확인결과 = { ok: false, reason: "invalid", status: 401, detail: "invalid key credentials" };
    await actions.recheckFalAccountAction(폼({ id: ID }));
    expect(calls[0]!.args).toMatchObject({ p_ok: false, p_detail: "invalid key credentials" });
    expect(오류()).toContain("「키 바꾸기」");
  });

  it("다른 열쇠로 잠긴 키는 풀지 못한다고 말한다", async () => {
    const sealed = sealFalKey(randomBytes(32), ID, 키);
    stored = { key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
    await actions.recheckFalAccountAction(폼({ id: ID }));
    expect(calls).toEqual([]);
    expect(오류()).toBe("서버 열쇠로 이 키를 풀 수 없습니다. 「키 바꾸기」로 키를 다시 넣어 주세요.");
  });
});

describe("DB 함수와 이름이 맞는다", () => {
  const migration = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "supabase", "migrations", "202610010001_fal_account_pool.sql"), "utf8");
  const paramsOf = (fn: string) => {
    const match = new RegExp(String.raw`create or replace function public\.${fn}\(([^)]*)\)`).exec(migration);
    if (!match) throw new Error(`${fn} 가 마이그레이션에 없습니다`);
    return [...match[1]!.matchAll(/\b(p_\w+)/g)].map((m) => m[1]!).sort();
  };

  it("다섯 액션이 부르는 함수 이름·인자 이름이 마이그레이션과 같다", async () => {
    const sealed = sealFalKey(열쇠, ID, 키);
    stored = { key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    await actions.updateFalAccountAction(폼({ id: ID, name: "a", limit: "20", enabled: "1" }));
    await actions.replaceFalKeyAction(폼({ id: ID, key: 키 }));
    await actions.recheckFalAccountAction(폼({ id: ID }));
    await actions.deleteFalAccountAction(폼({ id: ID }));
    expect(calls.map((c) => c.fn)).toEqual(["fal_account_add", "fal_account_update", "fal_account_set_key", "fal_account_recheck", "fal_account_delete"]);
    for (const call of calls) expect(Object.keys(call.args).sort()).toEqual(paramsOf(call.fn));
  });
});
