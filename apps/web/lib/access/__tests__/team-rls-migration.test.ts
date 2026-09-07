import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../../../supabase/migrations/202609070003_team_rls.sql", import.meta.url),
  "utf8",
);

/** 자기 `team_id` 로 판정하는 표. */
const parents = [
  "sns_projects",
  "poster_projects",
  "library_items",
  "characters",
  "reference_sets",
];

/** 부모를 통해 판정하는 표. */
const children = ["sns_cards", "poster_images", "library_images", "character_views"];

describe("판정 함수", () => {
  it("소유자 권한으로 돈다", () => {
    // `team_members` 는 회원에게 select 를 안 열었다. 이 함수가 소유자
    // 권한으로 돌아야 회원 브라우저에 표를 열지 않고도 판정이 된다.
    expect(sql).toMatch(/create or replace function public\.same_team[\s\S]*?security definer/);
  });

  it("search_path 를 못 박는다", () => {
    // 안 박으면 부르는 쪽이 스키마를 바꿔치기해 다른 team_members 를
    // 읽히게 할 수 있다. `security definer` 함수의 기본이다.
    expect(sql).toMatch(/security definer[\s\S]*?set search_path = public/);
  });

  it("팀이 없으면 「내 것인가」를 묻는다", () => {
    // 오늘은 team_id 가 전부 null 이라 이 길로만 간다. 그래서 동작이 안 바뀐다.
    expect(sql).toMatch(/else row_user_id = \(select auth\.uid\(\)\)/);
  });

  it("회원이 부를 수 있다", () => {
    expect(sql).toContain("grant execute on function public.same_team(uuid, uuid) to authenticated");
  });
});

describe("읽기만 넓힌다", () => {
  it("더하는 정책이 전부 select 다", () => {
    // 쓰기·지우기를 넓히면 팀원이 남의 작업을 지운다. 팀장과 운영자가
    // 지우는 길은 서버 권한으로 따로 나 있어 이 정책을 안 탄다.
    const created = sql.match(/create policy[\s\S]*?using/g) ?? [];
    expect(created.length).toBeGreaterThan(0);
    for (const policy of created) expect(policy).toContain("for select");
  });

  it("with check 를 만들지 않는다", () => {
    // `with check` 는 INSERT·UPDATE 를 좌우한다. 읽기만 넓히는 판단과 어긋난다.
    expect(sql).not.toContain("with check");
  });

  it("기존 정책을 지우지 않는다", () => {
    // 새로 만드는 것만 지운다(두 번 돌려도 되게). 기존 소유자 정책은
    // 그대로 남아야 쓰기·지우기가 지금처럼 자기 것만이 된다.
    const drops = sql.match(/drop policy if exists "([^"]+)"/g) ?? [];
    for (const drop of drops) expect(drop).toContain("team reads");
  });

  it("for all 정책을 만들지 않는다", () => {
    expect(sql).not.toMatch(/create policy[\s\S]{0,200}for all/);
  });
});

describe("부모와 자식", () => {
  it("부모는 자기 칸으로 판정한다", () => {
    for (const table of parents) {
      expect(sql).toMatch(
        new RegExp(`on public\\.${table} for select[\\s\\S]*?public\\.same_team\\(team_id, user_id\\)`),
      );
    }
  });

  it("자식은 부모를 통해 판정한다", () => {
    // 자식에는 team_id 를 안 달았다. 양쪽에 달면 둘이 어긋난다.
    for (const table of children) {
      expect(sql).toMatch(
        new RegExp(`on public\\.${table} for select[\\s\\S]*?from public\\.\\w+ parent`),
      );
      expect(sql).toMatch(
        new RegExp(`on public\\.${table} for select[\\s\\S]*?same_team\\(parent\\.team_id, parent\\.user_id\\)`),
      );
    }
  });
});

describe("참고 이미지는 이번에 안 좁힌다", () => {
  it("전원 공개 정책을 건드리지 않는다", () => {
    // 지금 좁히면 가져가는 것만 있고 주는 것이 없다 — 팀이 아직 아무에게도
    // 없어서, 쓰던 본보기가 사라진 것으로 보일 뿐이다. 팀을 배정하는
    // 단계에서 팀 공용과 함께 좁힌다.
    expect(sql).not.toContain("members read all reference images");
    expect(sql).not.toMatch(/on public\.reference_images for select/);
  });
});

describe("표나 칸을 만들지 않는다", () => {
  it("이 단계는 정책만 다룬다", () => {
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("add column");
    expect(sql).not.toMatch(/drop table|drop column/);
  });
});
