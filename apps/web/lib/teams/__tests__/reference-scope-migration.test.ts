import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../../../supabase/migrations/202609070006_reference_team_scope.sql", import.meta.url),
  "utf8",
);

const code = sql.replace(/^\s*--.*$/gm, "");

describe("판정 함수", () => {
  it("소유자 권한으로 돈다", () => {
    // `teams` 와 `team_members` 는 회원에게 권한을 회수해 두었다. RLS 정책 식은
    // 묻는 사람의 권한으로 도니, 함수를 거치지 않으면 그 표를 못 읽는다.
    expect(code).toMatch(/create or replace function public\.reference_visible[\s\S]*?security definer/);
  });

  it("search_path 를 못 박는다", () => {
    expect(code).toMatch(/security definer[\s\S]*?set search_path = public/);
  });

  it("회원이 부를 수 있다", () => {
    // 정책이 이 함수를 부른다. 회원에게 실행 권한이 없으면 목록이 통째로 막힌다.
    expect(code).toContain("grant execute on function public.reference_visible(uuid, uuid) to authenticated");
  });
});

describe("팀을 안 쓰면 지금과 같다", () => {
  it("팀이 하나도 없으면 전부 보인다", () => {
    // **이 한 줄이 배포일에 아무것도 안 잃게 한다.** 설계대로 무조건 좁히면
    // 팀을 만들기도 전에 전원이 서로의 본보기를 잃는다.
    expect(code).toMatch(/when not exists \(select 1 from public\.teams where deleted_at is null\) then true/);
  });

  it("접힌 팀은 「쓰는 중」으로 안 친다", () => {
    expect(code).toContain("deleted_at is null");
  });
});

describe("팀이 생기면 좁아진다", () => {
  it("내 것은 팀이 안 붙어 있어도 보인다", () => {
    // 방금 올려 도장이 아직 안 찍힌 것이 내 눈앞에서 사라지면 안 된다.
    expect(code).toMatch(/when row_user_id = \(select auth\.uid\(\)\) then true/);
  });

  it("같은 팀 것이 보인다", () => {
    expect(code).toMatch(
      /row_team_id = \(select team_id from public\.team_members where user_id = \(select auth\.uid\(\)\)\)/,
    );
  });

  it("그 밖은 안 보인다", () => {
    // 이 `else false` 가 없으면 아무것도 안 좁혀진다.
    expect(code).toMatch(/else false\s*\n?\s*end;/);
  });
});

describe("읽기만 바꾼다", () => {
  it("옛 「전원 읽기」 정책을 걷어낸다", () => {
    // 안 지우면 정책이 OR 로 합쳐져 `using (true)` 가 그대로 이긴다.
    expect(code).toContain('drop policy if exists "members read all reference images"');
  });

  it("새 정책은 select 다", () => {
    expect(code).toMatch(/create policy "team reads reference images"[\s\S]*?for select/);
  });

  it("고치고 지우는 정책은 안 건드린다", () => {
    // 「내 것이면 전부」는 그대로 둔다. 남이 올린 본보기를 지울 수 있으면 그
    // 그림을 쓰던 다른 사람의 작업이 조용히 깨진다.
    expect(code).not.toContain('drop policy if exists "members manage own reference images"');
    expect(code).not.toMatch(/for all/);
  });

  it("세트 항목 정책을 안 건드린다", () => {
    // 이미 만들어 둔 세트에 남의 팀 그림이 들어 있다면, 막는 순간 그 세트가
    // 조용히 깨진다.
    expect(code).not.toContain("reference_set_items");
  });
});
