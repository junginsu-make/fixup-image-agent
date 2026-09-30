import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOURLY_LIMITS } from "../hourly-limit";

/**
 * **크레딧이 없거나 운영자가 멈췄으면 AI 예약을 거절한다**(설계 2026-09-30 §3.2·§5).
 *
 * 이 시험은 마이그레이션 **글**을 읽는다. 실제로 돌려 보는 것은
 * `scripts/tests/ai-usage-control.test.mjs`(일회용 PostgreSQL)가 한다.
 *
 * 순서가 곧 규칙이다 — 멈춤이 중복보다 앞이어야 같은 열쇠로 다시 와도 멈춤을 말하고,
 * 크레딧 없음이 중복보다 뒤여야 이미 잡힌 요청에 「크레딧 없음」이라고 거짓말하지 않는다.
 */

const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));
const FILE = "202609300001_ai_usage_control.sql";

/** 주석을 걷어낸다. 이 저장소의 SQL 은 설명이 길어 단어가 코드로 오인된다. */
function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

const ordered = readdirSync(migrationsDir).filter((name) => /^\d{12,14}_.*\.sql$/.test(name)).sort();

/** `credit_reserve` 를 마지막으로 정의한 본문. 그것이 운영에서 도는 동작이다. */
const latest = ordered
  .flatMap((file) =>
    [...code(file).matchAll(/create\s+or\s+replace\s+function\s+public\.credit_reserve\([\s\S]*?\$\$;/gi)]
      .map((match) => ({ file, body: match[0] })),
  )
  .at(-1);

const body = latest?.body ?? "";

function 자리(needle: string): number {
  const at = body.indexOf(needle);
  expect(at, `${needle} 을 찾지 못했다`).toBeGreaterThanOrEqual(0);
  return at;
}

describe("credit_reserve 마지막 판", () => {
  it("이 설계의 마이그레이션이 마지막으로 정의한다", () => {
    expect(latest?.file).toBe(FILE);
  });

  it("인자가 그대로다 — 하나라도 다르면 같은 이름 함수가 둘이 된다(42725)", () => {
    expect(body).toMatch(
      /^create or replace function public\.credit_reserve\(p_user uuid,p_request uuid,p_operation text,p_outputs integer\[\],p_resource text,p_analysis_limit integer default 10\)/,
    );
  });

  it("검사 순서가 설계 §3.2 와 같다", () => {
    const 순서 = [
      "'inactive_member'",
      "'credit_account_not_activated'",
      "'invalid_credit_quote'",
      "'ai_paused'",
      "'duplicate_request'",
      "'credits_required'",
      "'concurrent_limit'",
      "'analysis_rate_limit'",
      "'quota_exceeded'",
      "'team_quota_exceeded'",
    ].map(자리);
    expect(순서).toEqual([...순서].sort((a, b) => a - b));
  });

  it("멈춤은 app_settings 의 ai_paused 가 '1' 일 때만이다", () => {
    expect(body).toContain("exists(select 1 from app_settings where key='ai_paused' and value='1')");
  });

  it("크레딧 없음은 살아 있는 덩어리로 본다 — 만료된 덩어리에 남은 잡힌 크레딧은 세지 않는다", () => {
    expect(body).toContain(
      "not exists(select 1 from credit_grants where user_id=p_user and revoked_at is null and expires_at>now() and granted_units>consumed_units)",
    );
  });

  it("AI 없는 광고 내보내기는 멈춤·크레딧 없음 두 검사에서 모두 빠진다", () => {
    expect(body).toContain("v_no_ai boolean := p_operation='ad_export' and p_resource='ad:export';");
    expect(body).toMatch(/if not v_no_ai and exists\(select 1 from app_settings/);
    expect(body).toMatch(/if not v_no_ai and not exists\(select 1 from credit_grants/);
  });

  it("CS 셀 행은 시간당 면제 목록 + invalid_request 를 빼고, 기간 없이 센다", () => {
    const count = body.match(/select count\(\*\)::integer into v_cs_used[\s\S]*?;/);
    expect(count, "CS 를 세는 문장이 없다").toBeTruthy();
    expect(count![0]).toContain("operation='cs_ask'");
    expect(count![0]).toContain("coalesce(error_code,'') <> all (v_exempt_codes || array['invalid_request'])");
    expect(count![0], "「가입 후 통틀어」다 — 시간 조건이 붙으면 안 된다").not.toContain("interval");
    expect(body).toContain("if v_cs_used>=10 then");
  });

  it("시간당 한도를 두는 작업이 앱의 표와 같다 — cs_ask 가 장부 경로에서도 걸린다", () => {
    const branch = body.match(/if p_operation in \(([^)]*)\) then/);
    expect(branch, "시간당 갈래를 찾지 못했다").toBeTruthy();
    const counted = [...branch![1]!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(counted.sort()).toEqual(Object.keys(HOURLY_LIMITS).sort());
  });
});

describe("이 마이그레이션이 건드리지 않는 것", () => {
  it("공유 DB 의 다른 함수를 다시 정의하지 않는다 — detail-page-studio 가 같이 쓴다", () => {
    expect(code(FILE)).not.toMatch(/function\s+public\.(reserve_generation|credit_reserve_dispatch|admin_cost_\w+)\s*\(/i);
  });

  it("칸·표를 더하지 않는다 — 함수 본문만 바꾼다", () => {
    expect(code(FILE)).not.toMatch(/\b(alter|create)\s+table\b/i);
  });
});
