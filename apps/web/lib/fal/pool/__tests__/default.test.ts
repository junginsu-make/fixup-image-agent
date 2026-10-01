import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

/**
 * **배포 첫날 생성이 멈추지 않는다**(보충 2026-10-01). 서버 열쇠가 없거나 틀리면 풀을 끄고 `FAL_KEY` 로 보낸다.
 * 열쇠가 있으면 프로세스에 풀 하나.
 */
const liveAccounts = vi.fn(async () => [] as unknown[]);
vi.mock("../store", () => ({ supabaseFalPoolStore: () => ({ liveAccounts }) }));
vi.mock("../alert", () => ({ sendFalPoolAlert: vi.fn() }));

const { defaultFalRouter } = await import("../default");
const { createPoolRouter } = await import("../router");

describe("defaultFalRouter", () => {
  it("열쇠가 없으면 FAL_KEY 로 보내는 길 — 풀을 보지 않는다", async () => {
    const router = defaultFalRouter({ FAL_KEY: "env-key" });
    expect(await router.routeOf("r")).toEqual({ accountId: null, key: "env-key" });
    expect(liveAccounts).not.toHaveBeenCalled();
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
