import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **AI 비용 표·보고·스위치 마이그레이션은 새것만 더한다**(설계 2026-09-30 §3.3·§3.4·§5·§7).
 *
 * 같은 Supabase 를 detail-page-studio 가 본다. 그쪽은 `admin_cost_*` 를 그대로 부르고 예약은
 * `reserve_generation` 을 부른다. 이 파일들이 그것들을 다시 정의하면 남의 제품이 깨진다.
 * 동작은 `scripts/tests/ai-cost-events.test.mjs`·`ai-cost-admin.test.mjs`(실제 PostgreSQL)가 본다.
 */

const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));
const C3 = "202609300002_ai_cost_events.sql";

/** 주석을 걷어낸다. 이 저장소의 SQL 은 설명이 길어 단어가 코드로 오인된다. */
function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

const 정의한함수 = (sql: string) =>
  [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi)].map((match) => match[1]!.toLowerCase());

describe("새것만 더한다", () => {
  it("C3 는 ai_cost_record 하나만 정의한다", () => {
    expect(existsSync(path.join(migrationsDir, C3))).toBe(true);
    expect(정의한함수(code(C3))).toEqual(["ai_cost_record"]);
  });

  it("C3 는 기존 표를 바꾸지 않는다(다른 표 alter·drop 없음)", () => {
    const sql = code(C3);
    expect(sql).not.toMatch(/\balter\s+table\s+(?!public\.ai_cost_events\b)/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|function|index)\b/i);
  });
});

describe("비용 표", () => {
  const sql = code(C3);

  it("회원은 못 읽는다 — RLS 를 켜고 anon·authenticated 권한을 거둔다", () => {
    expect(sql).toMatch(/alter\s+table\s+public\.ai_cost_events\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.ai_cost_events\s+from\s+public,\s*anon,\s*authenticated/i);
  });

  it("fal 요청 id 는 unique — 같은 제출이 두 번 적히지 않는다", () => {
    expect(sql).toMatch(/fal_request_id\s+text\s+unique/i);
    expect(sql).toMatch(/on\s+conflict\s*\(\s*fal_request_id\s*\)\s+do\s+nothing/i);
  });

  it("그림 값은 기존 model_prices 로 매긴다", () => {
    expect(sql).toMatch(/from\s+model_prices\s+where\s+model\s*=\s*p_model/i);
  });

  it("쓰는 함수는 서비스 권한만 부른다", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.ai_cost_record\([^)]*\)\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.ai_cost_record\([^)]*\)\s+to\s+service_role/i);
  });
});
