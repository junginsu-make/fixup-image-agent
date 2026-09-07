import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 마이그레이션은 돌려 보기 전에는 확인할 길이 없다. 그래서 **글로 읽어**
 * 지키기로 한 것들을 못 박는다. 포스터 마이그레이션이 쓰는 방식과 같다.
 */
// 이 파일을 기준으로 찾는다. 다른 시험들은 `process.cwd()` 를 쓰는데,
// 그건 어떻게 실행하느냐에 따라 달라진다 — 꾸러미별로 돌리면 맞고
// 저장소 뿌리에서 한 파일만 돌리면 엉뚱한 곳을 본다.
const sql = readFileSync(
  new URL("../../../../../supabase/migrations/202609070001_teams.sql", import.meta.url),
  "utf8",
);

const tables = ["teams", "team_members", "projects"];

describe("팀 마이그레이션", () => {
  it("표 셋을 만든다", () => {
    for (const table of tables) expect(sql).toContain(`create table public.${table}`);
  });

  it("기존 표를 하나도 건드리지 않는다", () => {
    // 이 단계는 표만 세운다. 기존 표에 칸을 더하는 것은 다음 단계이고,
    // 그때가 이 프로젝트에서 가장 위험한 자리다. 섞으면 되돌릴 수 없다.
    expect(sql).not.toMatch(/alter table public\.(profiles|library|characters|ingest|sns|poster|reference|generation)/);
    expect(sql).not.toMatch(/drop table/);
    expect(sql).not.toContain("team_id uuid references public.library");
  });

  it("auth.users 를 직접 참조하지 않는다", () => {
    // 회원 정보는 profiles 를 거친다. auth 스키마를 직접 물면 그쪽 변경에
    // 끌려간다.
    expect(sql).not.toContain("auth.users(id)");
  });
});

describe("한 사람은 한 팀", () => {
  it("팀원 표의 기본 키가 user_id 하나다", () => {
    // 여러 팀을 허용하면 「지금 어느 팀 이름으로 만드나」를 모든 만들기
    // 화면에서 물어야 하고, 크레딧이 어느 팀에서 빠지는지도 갈린다.
    expect(sql).toMatch(/user_id\s+uuid primary key references public\.profiles\(id\)/);
  });

  it("팀 방향 조회에 색인이 있다", () => {
    // 기본 키가 user_id 라 「이 팀에 누가 있나」는 따로 색인이 필요하다.
    expect(sql).toContain("create index team_members_team_idx on public.team_members (team_id)");
  });
});

describe("지우는 것과 접는 것을 가른다", () => {
  it("팀은 지워도 행이 남는다", () => {
    // 팀을 지우면 그 안의 작업물이 통째로 안 보이게 된다. 되돌릴 길이
    // 없으면 그건 사고다.
    expect(sql).toMatch(/create table public\.teams[\s\S]*?deleted_at\s+timestamptz/);
  });

  it("프로젝트도 지우지 않고 접는다", () => {
    expect(sql).toMatch(/create table public\.projects[\s\S]*?archived_at timestamptz/);
  });

  it("같은 팀 안에서 프로젝트 이름이 겹치지 않는다", () => {
    expect(sql).toContain("unique (team_id, name)");
  });
});

describe("접근", () => {
  it("표 셋 모두 RLS 를 켠다", () => {
    for (const table of tables) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("정책을 하나도 만들지 않는다", () => {
    // 서버가 service role 로만 읽고 쓴다. 회원 브라우저가 PostgREST 로
    // 직접 긁으면 남의 팀 구성과 이름이 그대로 새 나간다.
    expect(sql).not.toContain("create policy");
  });

  it("anon·authenticated 의 기본 권한을 회수한다", () => {
    // Supabase 는 public 스키마 새 표에 기본 권한을 준다. 회수를 명시하지
    // 않으면 RLS 만으로는 막았다고 볼 수 없다.
    for (const table of tables) {
      expect(sql).toContain(`revoke all on public.${table} from anon`);
      expect(sql).toContain(`revoke all on public.${table} from authenticated`);
    }
  });
});

describe("크레딧은 아직 아무도 안 읽는다", () => {
  it("팀 한도 칸은 있되 기본이 0 이다", () => {
    // 0 은 「아직 안 정했다」는 뜻이다. 크레딧을 팀 몫으로 옮기는 것은
    // 마지막 단계다 — 돈이 오가는 길이라 나머지가 다 선 뒤에 손댄다.
    expect(sql).toMatch(/monthly_quota integer not null default 0/);
  });

  it("사람 한도를 건드리지 않는다", () => {
    expect(sql).not.toContain("profiles.monthly_quota");
    expect(sql).not.toContain("reserve_generation");
  });
});
