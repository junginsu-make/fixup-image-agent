import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEAM_SCOPED_TABLES } from "../core";

// `process.cwd()` 를 안 쓴다. vitest 를 `--root apps/web` 로 돌리면 그 값이
// 달라져 파일을 못 찾는다. import.meta.url 은 이 파일 위치라 안 흔들린다.
const sql = readFileSync(
  new URL("../../../../../supabase/migrations/202609070004_team_stamp.sql", import.meta.url),
  "utf8",
);

// 주석을 걷어낸 것. 이 파일은 왜 그렇게 했는지를 길게 적어 두어서, 주석까지
// 뒤지면 「설명에 나온 단어」를 코드로 착각한다.
const code = sql.replace(/^\s*--.*$/gm, "");

describe("도장 함수", () => {
  it("소유자 권한으로 돈다", () => {
    // `team_members` 는 회원에게 select 를 안 열었다. 소유자 권한으로 돌아야
    // 그 표를 읽는다.
    expect(sql).toMatch(/create or replace function public\.stamp_team[\s\S]*?security definer/);
  });

  it("search_path 를 못 박는다", () => {
    expect(sql).toMatch(/security definer[\s\S]*?set search_path = public/);
  });

  it("세션이 아니라 행의 주인으로 찾는다", () => {
    // 캐릭터와 포스터 이미지는 서비스 롤로 넣어서 `auth.uid()` 가 비어 있다.
    // 세션으로 찾으면 그 자리들이 조용히 팀 없이 만들어진다.
    expect(code).toMatch(/where tm\.user_id = new\.user_id/);
    expect(code).not.toContain("auth.uid()");
  });

  it("넣는 쪽이 정한 팀을 안 덮어쓴다", () => {
    // 매번 「이 사람의 지금 팀」으로 되돌리면 팀 간 이동을 만들 수 없다.
    expect(sql).toMatch(/if new\.team_id is not null then\s*\n\s*return new;/);
  });

  it("팀이 없으면 null 그대로 둔다", () => {
    // 소속 없는 사람의 작업물은 개인 것으로 남아야 한다. `select ... into` 가
    // 못 찾으면 null 이 들어가므로 예외 처리가 따로 없어야 맞다.
    expect(code).not.toMatch(/raise exception/i);
  });
});

describe("어디에 거나", () => {
  it("배정과 같은 여섯 표에 건다", () => {
    // 배정할 때 도장을 찍는 표와 여기가 갈리면, 어떤 것은 배정으로만 붙고
    // 어떤 것은 생성으로만 붙는다.
    for (const table of TEAM_SCOPED_TABLES) {
      expect(code).toContain(`before insert on public.${table}`);
    }
  });

  it("자식 표에는 안 건다", () => {
    // 자식은 부모를 통해 판정한다. 양쪽에 달면 둘이 어긋나는 날이 온다.
    for (const child of ["sns_cards", "poster_images", "library_images", "character_views"]) {
      expect(code).not.toContain(`on public.${child}`);
    }
  });

  it("정산 기록에는 아직 안 건다", () => {
    // 돈이 오가는 자리다. 6단계에서 `reserve_generation` 이 직접 적는다.
    expect(code).not.toContain("on public.generation_events");
  });

  it("insert 에만 건다", () => {
    // update 에도 걸면 팀을 비우는 것(팀에서 빼기)이 곧바로 되돌려진다.
    expect(code).not.toMatch(/before\s+update/i);
    expect(code).not.toMatch(/after\s+insert/i);
  });
});
