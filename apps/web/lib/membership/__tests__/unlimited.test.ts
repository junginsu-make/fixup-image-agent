import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { usageFromRow } from "../usage-row";
import { creditBalanceLabel } from "../credit-label";

/**
 * **최고 관리자는 무제한이다** (2026-09-22 사용자 결정, 202609220003).
 *
 * DB 는 관리자에게 다 쓸 수 없는 크기(1억)의 지급 한 덩어리를 준다. 화면이
 * 그 숫자를 그대로 보여 주면 「1억 크레딧 남음」이 된다 — 무제한이라고 말해야 한다.
 */
const web = join(__dirname, "..", "..", "..");
const row = (extra: Record<string, unknown>) => ({ pricing_policy: "image-v2", balance: 100_000_000, available: 99_999_997, used: 3, reserved: 0, ...extra });

describe("무제한", () => {
  it("잔액 행의 unlimited 를 옮긴다", () => {
    expect(usageFromRow(row({ unlimited: true })).unlimited).toBe(true);
  });

  /** 003 을 돌리기 전 서버에는 이 칸이 없다. 없으면 무제한이 아니다. */
  it("칸이 없거나 참이 아니면 무제한이 아니다", () => {
    expect(usageFromRow(row({})).unlimited).toBe(false);
    expect(usageFromRow(row({ unlimited: "true" })).unlimited).toBe(false);
    expect(usageFromRow({ used_units: 1, reserved_units: 0, quota: 10 }).unlimited).toBeFalsy();
  });

  it("무제한이면 숫자 대신 무제한이라고 말한다", () => {
    expect(creditBalanceLabel({ unlimited: true, remaining: 99_999_997 })).toBe("무제한");
    expect(creditBalanceLabel({ unlimited: false, remaining: 1200 })).toBe("1,200크레딧 남음");
    expect(creditBalanceLabel({ remaining: 0 })).toBe("0크레딧 남음");
  });

  /** 숫자가 나가는 자리. 하나라도 빠지면 그 화면에 1억이 뜬다. */
  it.each([
    "app/_components/studio-actions.tsx",
    "app/_components/credit-wallet.tsx",
    "app/admin/members/members-client.tsx",
    "app/team/credit-tab.tsx",
  ])("%s 가 무제한을 안다", (file) => {
    expect(readFileSync(join(web, file), "utf8")).toMatch(/\bunlimited\b|\bcreditBalanceLabel\(/);
  });
});
