import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 새로 가입한 회원이 **몇 장으로 시작하는가.**
 *
 * 이 값은 코드가 아니라 표의 기본값에 있어서, 틀려도 화면·테스트가 전부
 * 통과한다. 가입자만 조용히 적게 받는다. 그래서 SQL 을 읽어서 잰다.
 */

const url = (name: string) => new URL(`../../../../../supabase/migrations/${name}`, import.meta.url);

const raise = readFileSync(url("202609100003_signup_quota_30.sql"), "utf8");
const lower = readFileSync(url("202607290001_auto_activate_on_email_confirm.sql"), "utf8");
const base = readFileSync(url("202607230001_membership_usage.sql"), "utf8");

describe("가입 기본 한도", () => {
  it("30 으로 올린다", () => {
    expect(raise).toMatch(/alter table public\.profiles\s+alter column monthly_quota set default 30/);
  });

  /** 낮춘 마이그레이션보다 뒤에 와야 덮어쓴다. 앞서면 5 가 그대로 남는다. */
  it("낮춘 마이그레이션보다 나중 번호다", () => {
    expect("202609100003".localeCompare("202607290001")).toBeGreaterThan(0);
  });

  it("이미 가입한 회원의 한도는 건드리지 않는다", () => {
    // 관리자가 일부러 정한 값이 섞여 있다. 일괄 update 는 그것까지 덮는다.
    expect(raise).not.toMatch(/update public\.profiles/i);
  });

  /** 상한을 넘으면 기본값으로 행을 못 만든다 — 가입 자체가 막힌다. */
  it("표의 상한 안에 있다", () => {
    expect(base).toMatch(/monthly_quota >= 0 and monthly_quota <= 10000/);
    expect(30).toBeLessThanOrEqual(10000);
  });

  it("낮췄던 기록이 남아 있다", () => {
    // 왜 5였는지가 사라지면, 다음 사람이 이유 없이 되돌린다.
    expect(lower).toMatch(/alter column monthly_quota set default 5/);
  });
});
