import { describe, expect, it } from "vitest";
import {
  SESSION_MAX_MS,
  SESSION_START_COOKIE,
  sessionAuthCookieNames,
  sessionWindow,
} from "../session-window";

/**
 * 로그인 유지 24시간 (2026-09-23 사용자).
 *
 * 하루가 지나면 다시 로그인하게 한다. 공용 컴퓨터에 로그인이 남아 있어 다른
 * 사람이 그대로 들어가는 일을 줄인다.
 */
const 지금 = new Date("2026-09-23T10:00:00+09:00");
const 시각 = (시간: number) => String(지금.getTime() - 시간 * 60 * 60 * 1000);

describe("로그인 유지 시간", () => {
  it("24시간이다", () => {
    expect(SESSION_MAX_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("처음 보는 사람은 지금을 시작 시각으로 적는다", () => {
    expect(sessionWindow(undefined, 지금)).toEqual({ state: "start", startedAt: 지금.getTime() });
  });

  it("24시간 안이면 그대로 둔다 — 시작 시각을 늘리지 않는다", () => {
    expect(sessionWindow(시각(23.9), 지금)).toEqual({ state: "valid" });
  });

  it("24시간이 지나면 내보낸다", () => {
    expect(sessionWindow(시각(24.1), 지금)).toEqual({ state: "expired" });
  });

  it("딱 24시간이면 내보낸다", () => {
    expect(sessionWindow(시각(24), 지금)).toEqual({ state: "expired" });
  });

  it("값이 깨졌으면 지금부터 다시 센다 — 못 읽는다고 계속 열어 두지 않는다", () => {
    for (const 깨진값 of ["", "어제", "-1", "NaN", "9999999999999999999999"]) {
      expect(sessionWindow(깨진값, 지금).state).toBe("start");
    }
  });

  it("미래 시각이 적혀 있으면 지금부터 다시 센다", () => {
    expect(sessionWindow(String(지금.getTime() + 60_000), 지금)).toEqual({ state: "start", startedAt: 지금.getTime() });
  });

  it("내보낼 때 지울 쿠키를 고른다 — Supabase 로그인 쿠키와 우리 시작 시각", () => {
    const names = sessionAuthCookieNames([
      "sb-bbuweuvylystagohqlhf-auth-token",
      "sb-bbuweuvylystagohqlhf-auth-token.0",
      "sb-bbuweuvylystagohqlhf-auth-token.1",
      SESSION_START_COOKIE,
      "sb-bbuweuvylystagohqlhf-auth-token-code-verifier",
      "theme",
      "mcs-plan",
    ]);
    expect(names).toEqual([
      "sb-bbuweuvylystagohqlhf-auth-token",
      "sb-bbuweuvylystagohqlhf-auth-token.0",
      "sb-bbuweuvylystagohqlhf-auth-token.1",
      SESSION_START_COOKIE,
      "sb-bbuweuvylystagohqlhf-auth-token-code-verifier",
    ]);
  });
});
