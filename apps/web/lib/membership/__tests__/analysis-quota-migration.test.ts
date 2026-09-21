import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANALYSIS_QUOTA_EXEMPT_CODES, consumesAnalysisQuota } from "@fixup/pdp-core";

/**
 * **면제 목록이 두 곳에 있다. 갈리면 한도가 뚫리거나 사용자가 한 시간 막힌다**(C-9).
 *
 *   1. `packages/pdp-core/src/pdp.analysis-quota.ts` 의 `ANALYSIS_QUOTA_EXEMPT_CODES`
 *   2. `reserve_generation()` 안의 `v_exempt_codes`
 *
 * 한쪽만 넓히면 SQL 은 여전히 한도를 먹이고, 한쪽만 좁히면 SQL 만 면제해 준다.
 * 이 저장소는 같은 일을 이미 한 번 겪었다 — 작업 종류 목록이 세 곳에 있었고,
 * 2026-09-08 에 한 곳만 넓혀 예약이 통째로 거절됐다
 * (`lib/teams/__tests__/reserve-operation-whitelist.test.ts`).
 *
 * 그래서 **두 벌을 맞대 본다.**
 */

const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));

/** 주석을 걷어낸다. 이 저장소의 SQL 은 설명이 길어 단어가 코드로 오인된다. */
function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

/**
 * 어떤 것을 **마지막으로** 정의한 마이그레이션. 그것이 실제 동작이다.
 *
 * 파일 이름을 박아 두면, 다음 사람이 새 파일에서 함수를 다시 정의했을 때
 * 이 시험이 옛 파일만 보고 초록으로 남는다.
 */
function latestDefining(needle: string): string {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const last = files.filter((name) => code(name).includes(needle)).pop();
  expect(last, `${needle} 을 정의한 마이그레이션이 없다`).toBeTruthy();
  return code(last!);
}

const reserve = latestDefining("create or replace function public.reserve_generation");

/** `v_exempt_codes := array[ … ]` 안의 따옴표 친 값들. */
function sqlExemptCodes(): string[] {
  const block = reserve.match(/v_exempt_codes\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/);
  expect(block, "reserve_generation 에 v_exempt_codes 가 없다").toBeTruthy();
  return [...block![1]!.matchAll(/'([^']+)'/g)].map((hit) => hit[1]!);
}

describe("면제 목록이 코드와 SQL 에서 같다", () => {
  it("**글자 하나까지 같다**", () => {
    expect(sqlExemptCodes().slice().sort()).toEqual([...ANALYSIS_QUOTA_EXEMPT_CODES].sort());
  });

  it("**SQL 의 모든 면제 코드를 코드 쪽도 면제한다**", () => {
    for (const sqlCode of sqlExemptCodes()) {
      expect(consumesAnalysisQuota(sqlCode), `${sqlCode} 가 코드 쪽에서 한도를 먹는다`).toBe(false);
    }
  });
});

describe("한도 세는 자리가 실제로 갈라졌다", () => {
  it("**면제 목록을 보고 센다** — 옛 판은 예약 만료 하나만 뺐다", () => {
    expect(reserve).toContain("coalesce(error_code, '') <> all (v_exempt_codes)");
    expect(reserve).not.toContain("error_code is distinct from 'reservation_expired'");
  });

  /**
   * **면제만 두면 한도가 뚫린다.**
   *
   * 실패를 만들어 내면 얼마든지 다시 시도할 수 있게 된다. 설계가 「남용 제한은
   * 유지」라고 못 박은 자리다.
   */
  it("**면제와 무관한 천장이 따로 있다**", () => {
    expect(reserve).toContain("v_recent_attempts");
    // 천장을 세는 질의에는 면제 조건이 없어야 한다.
    const ceiling = reserve.slice(reserve.indexOf("into v_recent_attempts"));
    expect(ceiling.slice(0, 400)).not.toContain("v_exempt_codes");
  });

  it("천장은 한도보다 넉넉하다. 정상 사용은 여기 안 닿는다", () => {
    expect(reserve).toContain("v_recent_attempts >= v_analysis_limit * 10");
  });

  /**
   * **운영이 두 천장을 구분할 수 있어야 한다.** 한도를 올려야 하는 상황과
   * 남용을 봐야 하는 상황은 할 일이 정반대다. 사용자에게 가는 말은 같게 둔다.
   */
  it("**두 천장의 reason 이 다르고, 앱이 둘 다 안다**", () => {
    expect(reserve).toContain("'analysis_abuse_limit'");

    const api = readFileSync(fileURLToPath(new URL("../api.ts", import.meta.url)), "utf8");
    expect(api).toContain("analysis_abuse_limit:");
    // 429 여야 한다. 409 로 떨어지면 화면이 「새로고침」을 권한다.
    const statusLine = api.slice(api.indexOf("const status = ["), api.indexOf("const status = [") + 300);
    expect(statusLine).toContain("analysis_abuse_limit");
  });
});

/**
 * **바꾸기로 한 것 말고는 그대로다.**
 *
 * 돈이 오가는 함수를 통째로 다시 쓰는 마이그레이션이다. 한 줄을 흘리면 팀
 * 한도나 동시 생성 제한이 조용히 사라진다.
 */
describe("나머지 판단은 그대로다", () => {
  it.each([
    ["작업 종류 화이트리스트", "'poster_image', 'sns_image', 'ad_export'"],
    ["units 상한", "public.max_reserve_units()"],
    ["팀 한도", "public.effective_quota(p_user_id, v_team_id, v_profile.monthly_quota, v_period_start)"],
    ["동시 생성 제한", "v_inflight >= 1"],
    ["팀 탓 구분", "'team_quota_exceeded'"],
    ["예약 만료 정리", "error_code = 'reservation_expired'"],
    ["중복 요청", "'duplicate_request'"],
  ])("%s 가 남아 있다", (_label, needle) => {
    expect(reserve).toContain(needle);
  });
});
