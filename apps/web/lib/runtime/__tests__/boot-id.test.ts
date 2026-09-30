import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * **globalThis 에 심는 이유를 시험으로 고정한다**(R1).
 *
 * Next 는 `instrumentation.ts` 와 라우트 핸들러를 서로 다른 번들 레이어로 묶어 이 모듈을
 * 두 번 인스턴스화할 수 있다. `vi.resetModules()` 로 그 상황을 흉내 낸다 — 모듈 캐시만
 * 비우고 `globalThis` 는 프로세스에 그대로 남으므로, 두 번째 인스턴스도 같은 값을 봐야
 * 한다. 모듈 스코프 상수였다면 이 시험은 실패했을 것이다.
 */
describe("BOOT_ID", () => {
  it("모듈이 두 번 인스턴스화돼도 같은 값을 돌려준다", async () => {
    const first = await import("../boot-id");
    vi.resetModules();
    const second = await import("../boot-id");

    expect(second.BOOT_ID).toBe(first.BOOT_ID);
    expect(second.BOOT_ID).toMatch(/^[0-9a-f-]{36}$/);
  });
});
