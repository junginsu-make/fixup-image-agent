import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../../../supabase/migrations/202609070002_team_columns.sql", import.meta.url),
  "utf8",
);

/** 팀 칸이 붙는 부모 표. 자식 표는 여기 없어야 한다. */
const parents = [
  "library_items",
  "sns_projects",
  "poster_projects",
  "reference_images",
  "reference_sets",
  "characters",
];

/** 부모를 통해 판정하는 자식 표. 여기에 팀 칸이 붙으면 둘이 어긋난다. */
const children = ["sns_cards", "poster_images", "library_images", "character_views"];

describe("팀 칸 마이그레이션", () => {
  it("부모 표에 team_id 를 단다", () => {
    for (const table of parents) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table}\\s+add column if not exists team_id`),
      );
    }
  });

  it("자식 표에는 안 단다", () => {
    // 양쪽에 달면 둘이 어긋나는 날이 오고, 그때 어느 쪽이 맞는지 정할
    // 근거가 없다. 자식은 부모를 통해 판정한다.
    for (const table of children) {
      expect(sql).not.toContain(`public.${table}`);
    }
  });

  it("정산 기록에도 팀을 단다", () => {
    // 크레딧을 팀 몫으로 옮기는 것은 마지막 단계지만, 칸은 지금 낸다 —
    // 그때 가서 달면 그 사이에 쌓인 기록에 팀이 없어 셀 수 없다.
    expect(sql).toMatch(/alter table public\.generation_events\s+add column if not exists team_id/);
  });
});

describe("팀을 지워도 작업물은 남는다", () => {
  it("모든 team_id 가 set null 이다", () => {
    // cascade 로 두면 팀 삭제 한 번에 회원 수십 명의 결과물이 사라진다.
    const teamColumns = sql.match(/add column if not exists team_id[^;]*/g) ?? [];
    expect(teamColumns.length).toBe(parents.length + 1); // 부모 여섯 + 정산 기록
    for (const line of teamColumns) {
      expect(line).toContain("on delete set null");
      expect(line).not.toContain("cascade");
    }
  });

  it("project_id 도 set null 이다", () => {
    const projectColumns = sql.match(/add column if not exists project_id[^;]*/g) ?? [];
    expect(projectColumns.length).toBeGreaterThan(0);
    for (const line of projectColumns) {
      expect(line).toContain("on delete set null");
    }
  });
});

describe("이 단계는 RLS 를 안 건드린다", () => {
  it("정책을 만들거나 지우지 않는다", () => {
    // 칸 추가와 RLS 전환을 한 번에 돌리면, 무언가 어긋났을 때 둘 중 어느 쪽
    // 때문인지 알 수 없다.
    expect(sql).not.toContain("create policy");
    expect(sql).not.toContain("drop policy");
    expect(sql).not.toContain("enable row level security");
  });

  it("판정 함수를 만들지 않는다", () => {
    expect(sql).not.toContain("create or replace function");
    expect(sql).not.toContain("same_team");
  });

  it("표를 만들거나 지우지 않는다", () => {
    expect(sql).not.toContain("create table");
    expect(sql).not.toMatch(/drop table|drop column/);
  });
});

describe("두 번 돌려도 안전하다", () => {
  it("칸과 색인 모두 if not exists 를 쓴다", () => {
    // 마이그레이션이 중간에 끊기거나 다시 돌아가는 일이 있다.
    const adds = sql.match(/add column[^;]*/g) ?? [];
    for (const line of adds) expect(line).toContain("if not exists");

    const indexes = sql.match(/create index[^;]*/g) ?? [];
    expect(indexes.length).toBeGreaterThan(0);
    for (const line of indexes) expect(line).toContain("if not exists");
  });
});
