import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: async () => ({ data: null, error: null }) }) }));

const { closeRestartOrphans, isLocalStoreEnabled: isLocalStoreEnabledInline } = await import("../restart-orphans");
const { BOOT_ID } = await import("../boot-id");
// 원본은 여기서만 부른다 — edge 번들에는 이 시험 파일이 안 들어간다.
const { isLocalStoreEnabled: isLocalStoreEnabledOriginal } = await import("../../local-store");

// `isLocalStoreEnabled` 는 이제 이 파일이 직접 갖는다(build fix — ../../local-store 를
// 불러오면 edge 번들에서 node:fs 해석이 죽는다). 그래서 모듈을 모킹하는 대신 그 함수가
// 실제로 읽는 환경변수(`restart-orphans.ts` 의 조건과 동일: NODE_ENV !== "production" &&
// LOCAL_STORE === "1")를 직접 조작한다. vitest 는 NODE_ENV 를 "test" 로 두므로 그대로면 꺼진 것.
beforeEach(() => { process.env.CREDIT_LEDGER = "1"; delete process.env.LOCAL_STORE; });

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
    process.env.CREDIT_LEDGER = "1"; process.env.LOCAL_STORE = "1";
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

/**
 * **build fix 동등성 시험**: `restart-orphans.ts` 가 `../../local-store` 대신
 * 직접 갖는 `isLocalStoreEnabled` 조건이 원본(`local-store/index.ts:129-131`)과
 * 갈라지면 안 된다 — 갈리면 기동 정리가 로컬 저장소에서 잘못 돌거나, 반대로
 * 운영에서 조용히 안 돌 수 있다. 두 함수 다 시그니처가 같다(선택 인자 하나,
 * 기본값 `process.env`) — `NODE_ENV` 는 vitest 프로세스에서 읽기 전용이라 실제
 * `process.env` 를 바꿔 끼울 수 없으므로, 둘 다 같은 가짜 environment 객체를
 * 넣어 비교한다(`lib/__tests__/local-store.test.ts` 와 같은 방식).
 */
describe("isLocalStoreEnabled 동등성 — 복제한 조건이 원본과 갈리지 않는지", () => {
  const combos: Array<[nodeEnv: string | undefined, localStore: string | undefined]> = [
    ["test", "1"],
    ["test", "0"],
    ["test", undefined],
    ["production", "1"],
    ["production", undefined],
    ["development", "1"],
  ];

  it.each(combos)("NODE_ENV=%s LOCAL_STORE=%s 에서 원본과 같은 값", (nodeEnv, localStore) => {
    const environment = { NODE_ENV: nodeEnv, LOCAL_STORE: localStore } as NodeJS.ProcessEnv;
    expect(isLocalStoreEnabledInline(environment)).toBe(isLocalStoreEnabledOriginal(environment));
  });
});
