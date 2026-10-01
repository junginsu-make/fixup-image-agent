import { describe, expect, it } from "vitest";
import {
  SESSION_MAX_MS,
  SESSION_START_COOKIE,
  sessionAuthCookieNames,
  sessionStartValue,
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

});

/**
 * **시작 시각은 그 로그인(세션)에 묶인다**(2026-09-29).
 *
 * 시작 시각 쿠키가 24시간이 아니라 로그인 쿠키만큼 살게 되면서, 로그아웃해도
 * 그 쿠키가 남는다. 묶지 않으면 **며칠 뒤 다시 로그인하자마자 「24시간 지남」
 * 으로 튕기고**, 계정을 바꿔 들어온 사람이 앞사람의 시각을 물려받는다.
 *
 * 로그인할 때마다 Supabase 가 새 `session_id` 를 준다(토큰 안에 반드시 있다).
 * 쿠키에 그 번호를 함께 적고, 번호가 다르면 새로 센다.
 */
describe("시작 시각은 그 로그인에 묶인다", () => {
  const 묶은값 = (시간: number, 세션: string) => sessionStartValue(지금.getTime() - 시간 * 60 * 60 * 1000, 세션);

  it("시각과 세션 번호를 함께 적는다", () => {
    expect(sessionStartValue(123, "s-1")).toBe("123.s-1");
  });

  it("같은 로그인이면 24시간 뒤 내보낸다", () => {
    expect(sessionWindow(묶은값(24.1, "s-1"), 지금, "s-1")).toEqual({ state: "expired" });
    expect(sessionWindow(묶은값(23.9, "s-1"), 지금, "s-1")).toEqual({ state: "valid" });
  });

  it("다른 로그인의 시각이면 새로 센다 — 다시 로그인했거나 계정을 바꿨다", () => {
    expect(sessionWindow(묶은값(72, "s-old"), 지금, "s-new")).toEqual({ state: "start", startedAt: 지금.getTime() });
  });

  /** 배포 전에 받은 쿠키(시각만)는 세션을 알면 새로 묶는다. 한 번 새 24시간이 된다. */
  it("옛 모양(시각만)은 새로 묶는다", () => {
    expect(sessionWindow(시각(30), 지금, "s-1").state).toBe("start");
  });

  /** 세션 번호를 못 읽으면 옛 방식대로 시각만 본다 — 못 읽는다고 계속 열어 두지 않는다. */
  it("세션 번호를 모르면 시각만으로 잰다", () => {
    expect(sessionWindow(묶은값(24.1, "s-1"), 지금, null)).toEqual({ state: "expired" });
    expect(sessionWindow(시각(24.1), 지금, null)).toEqual({ state: "expired" });
  });
});

describe("지울 쿠키", () => {
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
