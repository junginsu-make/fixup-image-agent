import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "../../supabase/migrations/202608310002_sns.sql"),
  "utf8",
);
const compactSql = sql.replace(/\s+/g, " ");

function tableSection(table: string, nextTable?: string): string {
  const start = sql.indexOf(`create table public.${table}`);
  const end = nextTable ? sql.indexOf(`create table public.${nextTable}`, start) : sql.length;
  return sql.slice(start, end);
}

describe("카드뉴스 마이그레이션", () => {
  it("세 테이블을 만든다", () => {
    for (const table of ["sns_projects", "sns_generation_requests", "sns_cards"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("기존 테이블을 건드리지 않는다", () => {
    expect(sql).not.toMatch(/drop table/);
    expect(sql).not.toMatch(/alter table[\s\S]*drop column/);
  });

  it("비용은 생성 요청에만 있고 카드에는 없다", () => {
    const requests = tableSection("sns_generation_requests", "sns_cards");
    const cards = tableSection("sns_cards");
    expect(requests).toContain("cost_usd");
    expect(cards.slice(0, cards.indexOf(");"))).not.toContain("cost_usd");
  });

  it("소유자 규약을 따른다", () => {
    expect(sql).toContain("references public.profiles(id)");
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).not.toContain("auth.users(id)");
  });

  it("asset_path 는 Storage 경로다", () => {
    expect(sql).toContain("asset_path text");
  });

  it("프로젝트와 카드는 UPDATE 회수 뒤 허용 목록만 연다", () => {
    for (const table of ["sns_projects", "sns_cards"]) {
      const revokeAt = sql.indexOf(`revoke update on public.${table}`);
      const grantAt = sql.indexOf("grant update (", revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });

  it("비용 요청은 회원에게 읽기만 연다", () => {
    expect(compactSql).toContain("grant select on public.sns_generation_requests to authenticated");
    expect(compactSql).toContain("revoke insert, update, delete on public.sns_generation_requests from authenticated");
    expect(compactSql).not.toMatch(/grant (?:insert|update|delete)[^;]*on public\.sns_generation_requests/);
    expect(compactSql).not.toMatch(/grant (?:insert|update|delete) \([^)]*\) on public\.sns_generation_requests/);
  });

  it("프로젝트 삭제가 비용 요청을 간접 삭제하지 않는다", () => {
    const requests = tableSection("sns_generation_requests", "sns_cards");
    expect(requests).toContain("references public.sns_projects(id) on delete set null");
    expect(requests).not.toContain("references public.sns_projects(id) on delete cascade");
  });

  it("프로젝트와 카드는 INSERT 회수 뒤 허용 목록만 연다", () => {
    for (const table of ["sns_projects", "sns_cards"]) {
      const revokeAt = sql.indexOf(`revoke insert on public.${table}`);
      const grantAt = sql.indexOf("grant insert (", revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });

  it("첫 프로젝트 INSERT 에 필요한 회원 컬럼이 모두 열려 있다", () => {
    expect(compactSql).toContain(
      "grant insert (user_id, candidate_id, title, ratio, language, model_id, card_count_mode, card_count, tone_note, data) on public.sns_projects to authenticated",
    );
  });

  it("첫 카드 INSERT 에 필요한 회원 컬럼이 모두 열려 있다", () => {
    expect(compactSql).toContain(
      "grant insert (user_id, project_id, index, kind, role, copy, prompt) on public.sns_cards to authenticated",
    );
  });

  it("후보와 카드 관계도 같은 사용자의 행만 연결한다", () => {
    expect(sql).toContain("from public.ingest_candidates candidate");
    expect(sql).toContain("candidate.id = candidate_id");
    expect(sql).toContain("(select auth.uid()) = candidate.user_id");
    expect(sql).toContain("from public.sns_projects project");
    expect(sql).toContain("project.id = project_id");
    expect(sql).toContain("(select auth.uid()) = project.user_id");
  });
});
