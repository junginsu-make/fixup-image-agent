import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **방문 통계 마이그레이션은 새것만 더한다**(계획 2026-10-06 site-analytics).
 * 같은 Supabase 를 detail-page-studio 가 본다. 동작은 `scripts/tests/site-analytics*.test.mjs`(실제 PostgreSQL)가 본다.
 */
const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));

function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

const defined = (sql: string) =>
  [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi)].map((m) => m[1]!.toLowerCase()).sort();
const revoked = (sql: string, fn: string) =>
  new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}\\([^)]*\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i").test(sql);
const granted = (sql: string, fn: string) =>
  new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\([^)]*\\)\\s+to\\s+service_role`, "i").test(sql);

describe("표·함수 파일", () => {
  const sql = code("202610060001_site_analytics.sql");

  it("함수 여섯만 정의한다", () => {
    expect(defined(sql)).toEqual([
      "analytics_cookie_key", "analytics_forget", "analytics_link_cookie",
      "analytics_prune", "analytics_record", "analytics_visitor_hash",
    ]);
  });

  it("다른 표를 바꾸거나 지우지 않는다", () => {
    expect(sql).not.toMatch(/\balter\s+table\s+(?!public\.analytics_(page_views|salts)\b)/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|function|index)\b/i);
  });

  it("두 표 모두 RLS 를 켜고 회원·손님 권한을 거둔다", () => {
    for (const table of ["analytics_page_views", "analytics_salts"]) {
      expect(sql).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"));
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i"));
    }
  });

  it("바깥에서 부르는 넷은 서비스 권한만, 내부 둘은 아무에게도 주지 않는다", () => {
    for (const fn of ["analytics_record", "analytics_link_cookie", "analytics_forget", "analytics_prune"]) {
      expect(revoked(sql, fn), fn).toBe(true);
      expect(granted(sql, fn), fn).toBe(true);
    }
    for (const fn of ["analytics_visitor_hash", "analytics_cookie_key"]) {
      expect(revoked(sql, fn), fn).toBe(true);
      expect(granted(sql, fn), fn).toBe(false);
    }
  });

  it("IP·브라우저 정보·쿠키 원래 값 칸이 없다", () => {
    const table = sql.match(/create\s+table\s+if\s+not\s+exists\s+public\.analytics_page_views\s*\(([\s\S]*?)\n\);/i)?.[1] ?? "";
    expect(table.length).toBeGreaterThan(0);
    expect(table).not.toMatch(/\b(ip|user_agent|ua|cookie|fx_vid)\b\s+text/i);
  });
});
