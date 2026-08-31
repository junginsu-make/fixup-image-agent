import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "../../supabase/migrations/202608310001_ingest.sql"),
  "utf8",
);

describe("수집 마이그레이션", () => {
  it("두 테이블을 만든다", () => {
    expect(sql).toContain("create table public.ingest_sources");
    expect(sql).toContain("create table public.ingest_candidates");
  });

  it("기존 테이블을 건드리지 않는다", () => {
    // 같은 DB 를 개인 배포와 공유한다. alter/drop 이 있으면 그쪽이 죽는다.
    expect(sql).not.toMatch(/alter table public\.(profiles|library|characters|usage)/);
    expect(sql).not.toMatch(/drop table/);
  });

  it("RLS 를 켜고 소유자 기준으로 막는다", () => {
    expect(sql).toContain("alter table public.ingest_sources enable row level security");
    expect(sql).toContain("alter table public.ingest_candidates enable row level security");
    expect(sql).toContain("(select auth.uid()) = user_id");
  });

  it("컬럼 권한을 회수 먼저, 허용 목록 나중에 준다", () => {
    // 테이블 GRANT 뒤의 컬럼 REVOKE 는 아무 일도 하지 않는다.
    for (const table of ["ingest_sources", "ingest_candidates"]) {
      const revokeAt = sql.indexOf(`revoke update on public.${table}`);
      const grantAt = sql.indexOf("grant update (", revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });

  it("user_id 는 수정 대상 컬럼에 들어가지 않는다", () => {
    for (const grant of sql.match(/grant update \(([^)]+)\)/g) ?? []) {
      expect(grant).not.toContain("user_id");
    }
  });

  it("워커가 쓸 스케줄 칸이 있다", () => {
    for (const column of ["last_checked_at", "next_poll_at", "lease_until", "last_error"]) {
      expect(sql).toContain(column);
    }
  });
});
