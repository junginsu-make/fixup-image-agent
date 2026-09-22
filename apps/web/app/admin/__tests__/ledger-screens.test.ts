import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **전 회원이 크레딧 장부로 옮긴 뒤(202609220003) 옛 월 한도 칸이 거짓말을 하지 않는다.**
 *
 * 독립 리뷰(2026-09-22)가 찾은 자리들이다. 장부가 켜지면 `profiles.monthly_quota` 는
 * 아무것도 막지 않는다 — 그 칸을 보여 주고 저장하게 두면, 저장되는 척하거나 오류가 난다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

describe("회원 삭제", () => {
  const actions = read("app/admin/actions.ts");
  const body = actions.slice(actions.indexOf("export async function deleteMember"));

  /** 돈 기록이 있으면 DB 가 막는다. 막힌 뒤의 오류는 이유를 안 알려 준다. */
  it("지우기 전에 돈 기록을 먼저 묻는다", () => {
    const ask = body.indexOf('rpc("credit_member_has_records"');
    const remove = body.indexOf("auth.admin.deleteUser(");
    expect(ask).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(remove);
    expect(body).toContain("MONEY_RECORDS_MESSAGE");
  });

  /** 003 을 안 돌린 서버에는 그 함수가 없다. 그렇다고 삭제가 막히면 안 된다. */
  it("함수가 없는 서버에서는 그냥 지운다", () => {
    expect(body).toContain("ledgerMissing(keptError)");
  });
});

describe("장부가 켜지면 옛 한도 칸을 치운다", () => {
  /** 2026-09-22 에 회원 관리 탭으로 합치면서 월 한도 칸을 아예 뺐다. 크레딧은 「플랜·크레딧」 패널에서. */
  it("/admin 에 월 한도 폼이 없다", () => {
    const page = read("app/admin/page.tsx");
    expect(page).not.toContain("updateQuota");
    expect(page).not.toContain("QuotaForm");
  });

  it("팀 화면의 개인 상한 폼", () => {
    const tab = read("app/team/credit-tab.tsx");
    expect(tab).toMatch(/credit\.ledger \? null : canWrite \? \(\s*<form action=\{setPersonalQuotaAction\}/);
  });

  it("개인 상한 저장도 거절한다", () => {
    const actions = read("app/team/actions.ts");
    const body = actions.slice(actions.indexOf("export async function setPersonalQuotaAction"));
    expect(body.indexOf("isCreditLedgerEnabled()")).toBeLessThan(body.indexOf("setPersonalQuota(userId"));
  });

  it("팀 크레딧을 장부에서 읽으면 그렇다고 표시한다", () => {
    expect(read("lib/teams/store.ts")).toContain("ledger: true");
  });
});
