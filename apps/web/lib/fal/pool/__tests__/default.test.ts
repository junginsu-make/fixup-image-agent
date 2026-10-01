import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * **배포 첫날 생성이 멈추지 않는다**(보충 2026-10-01). 서버 열쇠가 없거나 틀리면 풀을 끄고 `FAL_KEY` 로 보낸다.
 * 열쇠가 있으면 프로세스에 풀 하나.
 */
const liveAccounts = vi.fn(async () => [] as Array<{ id: string }>);
vi.mock("../store", () => ({ supabaseFalPoolStore: () => ({ liveAccounts }) }));
vi.mock("../alert", () => ({ sendFalPoolAlert: vi.fn() }));

const { defaultFalRouter, refreshFalPool } = await import("../default");
const { createPoolRouter } = await import("../router");
const { sendFalPoolAlert } = await import("../alert");

type Holder = { pool: unknown; warned: boolean };
const globalHolder = globalThis as typeof globalThis & { __fixupFalPool?: Holder };

/**
 * **같은 객체를 그대로 두고 칸만 되돌린다.** `default.ts` 는 모듈이 뜰 때 `holder` 를 한 번만
 * `globalThis` 에서 읽어 지역 변수로 쥔다 — 여기서 `delete globalHolder.__fixupFalPool` 을 해도
 * 이미 불러온 모듈의 지역 참조는 그대로다. 그 참조가 보는 **같은 객체의 칸**을 고쳐야 다음 시험이
 * 깨끗이 시작한다.
 */
function resetFalPoolHolder(): void {
  const h = globalHolder.__fixupFalPool;
  if (h) {
    h.pool = null;
    h.warned = false;
  }
}

describe("defaultFalRouter", () => {
  it("열쇠가 없으면 FAL_KEY 로 보내는 길 — 풀을 보지 않는다", async () => {
    const router = defaultFalRouter({ FAL_KEY: "env-key" });
    expect(await router.routeOf("r")).toEqual({ accountId: null, key: "env-key" });
  });

  it("열쇠가 틀려도(32바이트가 아님) FAL_KEY 로 — 죽지 않는다", async () => {
    const router = defaultFalRouter({ FAL_KEY: "env-key", FAL_KEY_ENCRYPTION_SECRET: "short" });
    expect(await router.uploadRoute()).toEqual({ accountId: null, key: "env-key" });
  });

  it("열쇠가 있으면 같은 풀 하나를 돌려준다", () => {
    const secret = randomBytes(32).toString("base64");
    const first = defaultFalRouter({ FAL_KEY: "k", FAL_KEY_ENCRYPTION_SECRET: secret });
    const second = defaultFalRouter({ FAL_KEY: "k", FAL_KEY_ENCRYPTION_SECRET: secret });
    expect(first).toBe(second);
    expect(typeof (first as ReturnType<typeof createPoolRouter>).refresh).toBe("function");
  });
});

/**
 * **번들 레이어가 달라도 같은 풀 하나**(fix round 1). `lib/runtime/boot-id.ts` 와 같은 까닭 —
 * Next 가 이 모듈을 `app/api` 라우트와 서버 액션에서 따로 인스턴스화하면, 모듈 스코프 변수로는
 * 관리자 화면의 `refreshFalPool()` 이 생성 쪽이 실제로 쓰는 풀에 닿지 않는다.
 * `vi.resetModules()` 로 **다른 모듈 인스턴스**를 흉내 낸다 — `globalThis` 만 공유된다.
 */
describe("globalThis 로 묶은 풀(fix round 1)", () => {
  afterEach(resetFalPoolHolder);

  it("모듈을 다시 불러와도 같은 풀 — refresh() 가 서로에게 닿는다", async () => {
    const secret = randomBytes(32).toString("base64");
    const env = { FAL_KEY: "k", FAL_KEY_ENCRYPTION_SECRET: secret };

    vi.resetModules();
    const first = await import("../default");
    const router1 = first.defaultFalRouter(env);

    vi.resetModules();
    const second = await import("../default");
    const router2 = second.defaultFalRouter(env);

    expect(router2).toBe(router1);

    const refreshSpy = vi.spyOn(router1 as ReturnType<typeof createPoolRouter>, "refresh");
    second.refreshFalPool();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});

/**
 * **등록된 계정이 있는데 서버 열쇠가 없으면** 배포 첫날 풀이 꺼진 채로 아무도 모르면 안 된다 —
 * 한 번 메일을 보내고, 그 뒤로는 DB 도 다시 안 보고 메일도 또 안 보낸다(조용히 반복되지 않는다).
 * `environment === process.env` 일 때만 켜지는 경고라 실제 `process.env` 를 흔든다
 * (`vi.stubEnv`) — `defaultFalRouter()` 를 인자 없이 불러야 그 길을 탄다.
 */
describe("배포 첫날 계정 대기 경고", () => {
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  afterEach(() => {
    vi.unstubAllEnvs();
    resetFalPoolHolder();
    liveAccounts.mockClear();
    vi.mocked(sendFalPoolAlert).mockClear();
  });

  it("마스터 열쇠가 없고 계정이 있으면 한 번 경고한다", async () => {
    vi.stubEnv("FAL_KEY", "k");
    vi.stubEnv("FAL_KEY_ENCRYPTION_SECRET", "");
    liveAccounts.mockResolvedValueOnce([{ id: "a" }]);

    defaultFalRouter();
    await flush();

    expect(sendFalPoolAlert).toHaveBeenCalledTimes(1);
    expect(sendFalPoolAlert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "master_key_missing", detail: "등록된 계정 1개" }),
    );
  });

  it("두 번째 호출은 DB 를 다시 안 보고 메일도 또 안 보낸다", async () => {
    vi.stubEnv("FAL_KEY", "k");
    vi.stubEnv("FAL_KEY_ENCRYPTION_SECRET", "");
    liveAccounts.mockResolvedValue([{ id: "a" }]);

    defaultFalRouter();
    await flush();
    defaultFalRouter();
    await flush();

    expect(liveAccounts).toHaveBeenCalledTimes(1);
    expect(sendFalPoolAlert).toHaveBeenCalledTimes(1);
  });

  it("계정이 없으면 경고하지 않는다", async () => {
    vi.stubEnv("FAL_KEY", "k");
    vi.stubEnv("FAL_KEY_ENCRYPTION_SECRET", "");
    liveAccounts.mockResolvedValueOnce([]);

    defaultFalRouter();
    await flush();

    expect(liveAccounts).toHaveBeenCalledTimes(1);
    expect(sendFalPoolAlert).not.toHaveBeenCalled();
  });
});
