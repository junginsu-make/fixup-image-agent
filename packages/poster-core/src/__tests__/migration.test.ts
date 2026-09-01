import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "../../supabase/migrations/202608310004_poster.sql"),
  "utf8",
);

const tables = ["poster_references", "poster_projects", "poster_generation_requests", "poster_images"];

describe("포스터 마이그레이션", () => {
  it("네 테이블을 만든다", () => {
    for (const table of tables) expect(sql).toContain(`create table public.${table}`);
  });

  it("기존 테이블을 건드리지 않는다", () => {
    // 같은 DB 를 개인 배포와 공유한다. alter/drop 이 있으면 그쪽이 죽는다.
    expect(sql).not.toMatch(/alter table public\.(profiles|library|characters|ingest|sns)/);
    expect(sql).not.toMatch(/drop table/);
    expect(sql).not.toContain("public.teams");
    expect(sql).not.toContain("auth.users(id)");
  });

  it("소유자는 사람 한 명이다 — 팀 개념이 없다", () => {
    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`create table public\\.${table}[\\s\\S]*?user_id uuid not null references public\\.profiles\\(id\\)`));
    }
    expect(sql).toContain("(select auth.uid()) = user_id");
  });

  it("RLS 를 네 테이블 모두 켠다", () => {
    for (const table of tables) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("Storage 경로 첫 칸이 소유자여야 한다", () => {
    // 기존 Storage 정책이 경로 첫 칸으로 판정한다. 새 정책을 만들지 않는다.
    expect(sql).toMatch(/storage_path ~ \('\^' \|\| user_id::text/);
  });

  it("참고 이미지 INSERT 에 id 가 열려 있다", () => {
    // CHECK 가 경로에 행의 id 를 요구한다. id 를 못 넣으면 모든 INSERT 가 실패한다.
    const grant = sql.match(/grant insert \(([^)]+)\)\s+on public\.poster_references/);
    expect(grant).not.toBeNull();
    expect(grant![1]).toContain("id");
  });

  it("컬럼 권한은 회수 먼저, 허용 목록 나중이다", () => {
    for (const table of ["poster_references", "poster_projects"]) {
      const revokeAt = sql.indexOf(`revoke insert on public.${table}`);
      const grantAt = sql.indexOf("grant insert (", revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });

  it("비용 행은 회원이 쓰지 못한다", () => {
    // 회원이 cost_usd 를 고칠 수 있으면 비용 장부를 믿을 수 없다.
    expect(sql).toMatch(/revoke insert, update, delete on public\.poster_generation_requests/);
    expect(sql).not.toMatch(/grant [^;]*insert[^;]*on public\.poster_generation_requests/);
    expect(sql).not.toMatch(/grant update \([^)]*cost/);
  });

  it("프로젝트를 지워도 비용 장부는 남는다", () => {
    // cascade 면 회원이 프로젝트 삭제로 비용 기록을 간접 삭제할 수 있다.
    expect(sql).toMatch(/project_id uuid references public\.poster_projects\(id\) on delete set null/);
  });

  it("이미지에서 회원이 바꾸는 것은 선택 여부뿐이다", () => {
    const grant = sql.match(/grant update \(([^)]+)\)\s+on public\.poster_images/);
    expect(grant).not.toBeNull();
    expect(grant![1].trim()).toBe("selected");
  });

  it("같은 요청에 같은 변형 번호가 두 번 올 수 없다", () => {
    expect(sql).toMatch(/unique \(generation_request_id, variant_index\)/);
  });

  it("프로젝트마다 선택된 이미지는 하나뿐이다", () => {
    expect(sql).toMatch(/unique index[\s\S]*poster_images\(project_id\)[\s\S]*where selected/);
  });

  it("남의 프로젝트에 이미지를 붙일 수 없다", () => {
    // reference_set_items 에서 겪은 것과 같은 자리다. id 만 알면 붙는 일이 없어야 한다.
    expect(sql).toMatch(/with check[\s\S]*poster_projects p[\s\S]*p\.id = project_id/);
  });
});
