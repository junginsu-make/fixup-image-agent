import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CREDIT_UNIT_USD } from "@fixup/shared";

/**
 * 새로 가입한 회원이 **몇 장으로 시작하는가.**
 *
 * 이 값은 코드가 아니라 표의 기본값에 있어서, 틀려도 화면·테스트가 전부
 * 통과한다. 가입자만 조용히 적게 받는다. 그래서 SQL 을 읽어서 잰다.
 *
 * 값이 세 번 바뀌었다 — 30(처음) → 5(자동 승인으로 바꾸며 낮춤) →
 * 30(체험이 안 됨) → 100(한 종류만 보고 끝남). **마지막 것이 이긴다.**
 */

const url = (name: string) => new URL(`../../../../../supabase/migrations/${name}`, import.meta.url);

/** 번호 순. 뒤에 오는 것이 앞의 기본값을 덮는다. */
const 순서 = [
  { id: "202607230001", file: "202607230001_membership_usage.sql", quota: 30 },
  { id: "202607290001", file: "202607290001_auto_activate_on_email_confirm.sql", quota: 5 },
  { id: "202609100003", file: "202609100003_signup_quota_30.sql", quota: 30 },
  { id: "202609100005", file: "202609100005_signup_quota_100.sql", quota: 100 },
];

const 마지막 = 순서[순서.length - 1]!;
const 읽기 = (file: string) => readFileSync(url(file), "utf8");

describe("가입 기본 한도", () => {
  it("마지막 마이그레이션이 100 으로 정한다", () => {
    expect(읽기(마지막.file)).toMatch(
      new RegExp(`alter column monthly_quota set default ${마지막.quota}\\b`),
    );
  });

  /**
   * 번호가 앞서면 옛 값이 그대로 남는다. **파일 이름 하나로 결과가 뒤집힌다.**
   */
  it("번호 순서대로 뒤가 앞을 덮는다", () => {
    for (let i = 1; i < 순서.length; i += 1) {
      expect(순서[i]!.id.localeCompare(순서[i - 1]!.id)).toBeGreaterThan(0);
    }
  });

  it("이미 가입한 회원의 한도는 건드리지 않는다", () => {
    // 관리자가 일부러 정한 값이 섞여 있다. 일괄 update 는 그것까지 덮는다.
    expect(읽기(마지막.file)).not.toMatch(/update public\.profiles/i);
  });

  /** 상한을 넘으면 기본값으로 행을 못 만든다 — 가입 자체가 막힌다. */
  it("표의 상한 안에 있다", () => {
    expect(읽기(순서[0]!.file)).toMatch(/monthly_quota >= 0 and monthly_quota <= 10000/);
    expect(마지막.quota).toBeLessThanOrEqual(10000);
  });

  /**
   * 한도는 곧 돈이다. 숫자만 올리면 얼마가 나가는지 아무도 안 센다.
   * 100장 × $0.05 = **가입 한 명당 $5**.
   */
  it("얼마짜리인지 적어 둔다", () => {
    const 노출 = 마지막.quota * CREDIT_UNIT_USD;
    expect(노출).toBe(5);
    // 마이그레이션이 그 금액을 밝히고 있어야 한다.
    expect(읽기(마지막.file)).toContain("$5.00");
  });

  it("낮췄던 기록이 남아 있다", () => {
    // 왜 5였는지가 사라지면, 다음 사람이 이유 없이 되돌린다.
    expect(읽기(순서[1]!.file)).toMatch(/alter column monthly_quota set default 5\b/);
  });
});
