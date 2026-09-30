import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const local = vi.hoisted(() => ({ on: false }));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => local.on }));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: async () => ({ data: null, error: null }) }) }));

const { closeRestartOrphans } = await import("../restart-orphans");
const { BOOT_ID } = await import("../boot-id");

beforeEach(() => { process.env.CREDIT_LEDGER = "1"; local.on = false; });

describe("closeRestartOrphans", () => {
  it("이 프로세스의 표식으로 DB 정리 함수를 한 번 부르고 결과를 남긴다", async () => {
    const calls: unknown[] = [];
    const logs: unknown[] = [];
    await closeRestartOrphans({
      rpc: async (name, args) => { calls.push([name, args]); return { data: { released: 2, needs_review: 1 }, error: null }; },
      log: (message, detail) => logs.push([message, detail]),
    });
    expect(calls).toEqual([["credit_close_restart_orphans", { p_boot: BOOT_ID }]]);
    expect(JSON.stringify(logs)).toContain("\"released\":2");
  });

  it("RPC 오류를 삼킨다 — 기동을 막지 않는다", async () => {
    const logs: unknown[] = [];
    await expect(closeRestartOrphans({
      rpc: async () => ({ data: null, error: { message: "down" } }),
      log: (message, detail) => logs.push([message, detail]),
    })).resolves.toBeUndefined();
    expect(JSON.stringify(logs)).toContain("down");
  });

  it("던져도 삼킨다", async () => {
    await expect(closeRestartOrphans({ rpc: async () => { throw new Error("net"); }, log: () => undefined })).resolves.toBeUndefined();
  });

  it("장부가 꺼져 있거나 로컬 저장소면 부르지 않는다", async () => {
    const calls: unknown[] = [];
    const rpc = async (name: string) => { calls.push(name); return { data: null, error: null }; };
    process.env.CREDIT_LEDGER = "";
    await closeRestartOrphans({ rpc, log: () => undefined });
    process.env.CREDIT_LEDGER = "1"; local.on = true;
    await closeRestartOrphans({ rpc, log: () => undefined });
    expect(calls).toEqual([]);
  });

  /**
   * **R3/R7**: `failed` 가 하나라도 있으면 성공 응답이어도 오류 레벨 로거를
   * 따로 부른다 — 기동은 막지 않지만, 손으로 봐야 할 것이 있다는 신호는
   * 조용히 삼키지 않는다.
   */
  it("failed 가 있으면 오류 로거로도 남긴다", async () => {
    const logs: unknown[] = [];
    const errors: unknown[] = [];
    await closeRestartOrphans({
      rpc: async () => ({ data: { released: 1, needs_review: 0, failed: 1 }, error: null }),
      log: (message, detail) => logs.push([message, detail]),
      error: (message, detail) => errors.push([message, detail]),
    });
    expect(errors.length).toBe(1);
    expect(JSON.stringify(errors)).toContain("\"failed\":1");
    // 정상 로그도 그대로 남는다 — 오류 로거는 추가일 뿐, 대체가 아니다.
    expect(JSON.stringify(logs)).toContain("\"released\":1");
  });

  it("failed 가 없으면 오류 로거를 부르지 않는다", async () => {
    const errors: unknown[] = [];
    await closeRestartOrphans({
      rpc: async () => ({ data: { released: 2, needs_review: 1 }, error: null }),
      log: () => undefined,
      error: (message, detail) => errors.push([message, detail]),
    });
    expect(errors).toEqual([]);
  });
});
