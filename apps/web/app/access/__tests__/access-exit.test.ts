import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isTerminalWait, isUsableAccount } from "../../../lib/membership/usable";
import {
  ACCESS_POLL_LIMIT,
  ACCESS_POLL_MS,
  pollExhaustedNotice,
  shouldPollAccess,
} from "../poll";

/**
 * 대기 화면이 막다른 길이 아닌지 본다.
 *
 * 2026-09-14 에 이메일 인증을 마친 사람이 「잠시만 기다려 주세요」 앞에 그대로
 * 섰다. 계정은 이미 멀쩡했는데 미들웨어가 `/access` 만 조건 없이 통과시켜서,
 * 다음 걸음이 저절로 오지 않았다.
 *
 * jsdom 이 없어 화면을 그려 볼 수 없다. 판단을 직접 시험하고, 그것이 실제로
 * 걸렸는지는 파일을 글자로 읽어 확인한다.
 */

const WEB = process.cwd();
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

const middleware = read("middleware.ts");
const page = read("app/access/page.tsx");
const server = read("lib/membership/server.ts");

const profile = (email_confirmed_at: string | null, status: string) => ({
  email_confirmed_at,
  status,
});

describe("쓸 수 있는 계정인가", () => {
  it("인증을 마치고 정지되지 않았으면 쓸 수 있다", () => {
    expect(isUsableAccount(profile("2026-09-14T04:21:16Z", "active"))).toBe(true);
  });

  it("인증을 안 했으면 못 쓴다", () => {
    expect(isUsableAccount(profile(null, "active"))).toBe(false);
  });

  it("정지·대기 상태면 못 쓴다", () => {
    for (const status of ["pending", "suspended"]) {
      expect(isUsableAccount(profile("2026-09-14T04:21:16Z", status))).toBe(false);
    }
  });

  /** 프로필을 못 읽었을 때 열어 주면, 읽기 실패가 곧 권한이 된다. */
  it("프로필이 없으면 못 쓴다", () => {
    expect(isUsableAccount(null)).toBe(false);
    expect(isUsableAccount(undefined)).toBe(false);
    expect(isUsableAccount({})).toBe(false);
  });

  it("정지만 기다려도 안 풀리는 상태다", () => {
    expect(isTerminalWait(profile(null, "suspended"))).toBe(true);
    expect(isTerminalWait(profile(null, "pending"))).toBe(false);
  });
});

describe("세 곳이 같은 답을 쓴다", () => {
  /**
   * **어긋나면 화면이 서로를 밀어낸다.** 미들웨어가 「들어가라」 하고 화면이
   * 「기다려라」 하면 두 주소가 서로를 가리키며 멈추지 않는다. 사용자에게는
   * 화면이 깜빡이는 것으로 보인다.
   */
  it("미들웨어·대기 화면·문지기가 모두 한 함수를 쓴다", () => {
    for (const source of [middleware, page, server]) {
      expect(source).toContain("isUsableAccount");
    }
  });

  /** 예전처럼 손으로 조건을 다시 적으면 곧 어긋난다. */
  it("조건을 손으로 다시 적지 않는다", () => {
    for (const source of [middleware, server]) {
      expect(source).not.toContain('status === "active"');
    }
  });
});

describe("막다른 길이 아니다", () => {
  /**
   * 전에는 `if (pathname === "/access") return response;` 한 줄이 조건 없이
   * 통과시켰다. 쓸 수 있는 사람은 들여보내야 한다.
   */
  it("미들웨어가 쓸 수 있는 사람을 들여보낸다", () => {
    const at = middleware.indexOf('pathname === "/access"');
    expect(at).toBeGreaterThan(0);
    const block = middleware.slice(at, at + 220);
    expect(block).toContain("HOME_AFTER_LOGIN");
    expect(block).toContain("active");
  });

  /**
   * 화면이 스스로 상태를 다시 물을 때는 이 서버 컴포넌트가 다시 그려진다.
   * 여기 문이 없으면 상태가 바뀌어도 그 자리에 남는다.
   */
  it("대기 화면 자신도 나가는 문을 갖는다", () => {
    expect(page).toContain("if (isUsableAccount(profile)) redirect(HOME_AFTER_LOGIN)");
  });
});

describe("스스로 다시 묻는다", () => {
  it("기다리는 동안에는 계속 묻는다", () => {
    expect(shouldPollAccess({ suspended: false, tries: 0 })).toBe(true);
    expect(shouldPollAccess({ suspended: false, tries: ACCESS_POLL_LIMIT - 1 })).toBe(true);
  });

  /** 정지는 기다려도 안 풀린다. 두드려 봐야 서버만 먹는다. */
  it("정지된 계정에는 묻지 않는다", () => {
    expect(shouldPollAccess({ suspended: true, tries: 0 })).toBe(false);
  });

  it("정해 둔 횟수를 넘기면 멈춘다", () => {
    expect(shouldPollAccess({ suspended: false, tries: ACCESS_POLL_LIMIT })).toBe(false);
    expect(shouldPollAccess({ suspended: false, tries: ACCESS_POLL_LIMIT + 9 })).toBe(false);
  });

  /** 너무 자주 물으면 서버를 두드리고, 너무 뜸하면 기다림이 길어진다. */
  it("묻는 간격이 지나치지 않다", () => {
    expect(ACCESS_POLL_MS).toBeGreaterThanOrEqual(2000);
    expect(ACCESS_POLL_MS).toBeLessThanOrEqual(10000);
  });

  /** 2분 안팎이면 충분하다. 그보다 길면 기다려서 풀릴 일이 아니다. */
  it("무한히 묻지 않는다", () => {
    const total = (ACCESS_POLL_MS * ACCESS_POLL_LIMIT) / 1000;
    expect(total).toBeGreaterThanOrEqual(60);
    expect(total).toBeLessThanOrEqual(300);
  });

  /** 아무 말 없이 조용해지면 사용자는 고장으로 읽는다. */
  it("그만 물을 때 왜 멈췄는지 말한다", () => {
    for (const unconfirmed of [true, false]) {
      expect(pollExhaustedNotice(unconfirmed).trim().length).toBeGreaterThan(10);
    }
    expect(pollExhaustedNotice(true)).not.toBe(pollExhaustedNotice(false));
  });

  it("대기 화면이 그 규칙을 실제로 쓴다", () => {
    const actions = read("app/access/access-actions.tsx");
    expect(actions).toContain("shouldPollAccess");
    expect(actions).toContain("router.refresh()");
    // 시계를 걷어내지 않으면 화면을 떠난 뒤에도 계속 묻는다.
    expect(actions).toContain("clearTimeout");
  });
});
