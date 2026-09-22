import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **로그인 안 한 방문자도 지금 실제로 도는 요금을 본다** (2026-09-22).
 *
 * 설명서는 로그인 없이 열린다. 전에는 회원이 없으면 옛 기준(「모델마다
 * 차감량이 다릅니다」)을 말했는데, 전 회원이 새 장부로 옮긴 뒤(202609220003)
 * 그 설명은 **가입하면 받게 될 요금이 아니다.** 장부가 켜져 있으면 방문자에게도
 * 「이미지 1장 = 1크레딧」을 말한다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

describe("방문자가 보는 요금 설명", () => {
  it.each(["app/guide/page.tsx", "app/guide/credits/page.tsx"])("%s 는 회원이 없을 때 장부 스위치를 본다", (file) => {
    expect(read(file)).toContain("isCreditLedgerEnabled()");
  });

  /** 방문자에게는 잔액이 없다. 잔액 상자를 그리면 0 을 보여 주거나 터진다. */
  it("잔액 상자는 회원일 때만 그린다", () => {
    expect(read("app/guide/credits/page.tsx")).toMatch(/usage\s*&&\s*<CreditWallet/);
  });
});
