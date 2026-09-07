import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../../../supabase/migrations/202609070005_team_credit.sql", import.meta.url),
  "utf8",
);

// 주석을 걷어낸 것. 이 파일은 왜 그렇게 했는지를 길게 적어 두어서, 주석까지
// 뒤지면 「설명에 나온 단어」를 코드로 착각한다.
const code = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*--.*$/gm, "");

describe("상한이 한 곳에만 있다", () => {
  it("표의 check 가 함수를 부른다", () => {
    // **2026-09-04 사고의 재발 방지다.** 함수의 상한(60)과 표의 check(60)가
    // 같은 값을 두 곳에 두고 있었고, 그날 둘이 갈려 전량 실패했다.
    expect(code).toMatch(
      /check \(requested_units >= 0 and requested_units <= public\.max_reserve_units\(\)\)/,
    );
  });

  it("예약 함수도 같은 것을 부른다", () => {
    expect(code).toMatch(/p_units > public\.max_reserve_units\(\)/);
  });

  it("숫자 60 을 두 번 적지 않는다", () => {
    // 어딘가에 60 이 또 적혀 있으면 그것이 다음에 갈릴 자리다.
    const sixties = code.match(/\b60\b/g) ?? [];
    expect(sixties.length).toBe(1);
  });

  it("check 가 부를 수 있게 immutable 이다", () => {
    // volatile·stable 함수는 check 제약에서 못 쓴다.
    expect(code).toMatch(
      /create or replace function public\.max_reserve_units\(\)[\s\S]*?immutable/,
    );
  });
});

describe("팀이 없으면 지금과 같다", () => {
  it("팀이 없으면 개인 상한 그대로다", () => {
    // **오늘 실제로 도는 길이다.** 여기가 틀리면 모두가 멈춘다.
    expect(code).toMatch(/when p_team_id is null then p_personal_quota/);
  });

  it("팀 한도가 0 이면 개인 상한 그대로다", () => {
    // 0 은 「아직 안 정했다」다. 팀을 만든 순간 쓸 수 있는 양이 줄면 사고다.
    expect(code).toMatch(/when t\.monthly_quota = 0 then p_personal_quota/);
  });

  it("팀을 못 찾아도 개인 상한으로 떨어진다", () => {
    // 접힌 팀에 든 사람은 select 가 null 을 준다. null 을 그대로 두면 비교가
    // 전부 거짓이 되어 아무것도 못 만든다.
    expect(code).toMatch(/coalesce\([\s\S]*?p_personal_quota\s*\)/);
  });
});

describe("팀 한도", () => {
  it("개인 상한과 팀 잔량 중 작은 쪽이다", () => {
    expect(code).toMatch(/least\(\s*p_personal_quota/);
  });

  it("잔량이 음수면 0 으로 자른다", () => {
    // 팀 한도를 나중에 내리면 이미 쓴 것이 더 많을 수 있다.
    expect(code).toMatch(/greatest\(0, t\.monthly_quota - public\.team_units_used/);
  });

  it("나를 빼고 팀 사용량을 센다", () => {
    // 내 것까지 넣어 세면 부르는 쪽에서 내 것을 두 번 더한다.
    expect(code).toMatch(/user_id is distinct from p_exclude_user/);
  });

  it("접힌 팀의 한도는 안 본다", () => {
    expect(code).toMatch(/from public\.teams t\s*\n\s*where t\.id = p_team_id and t\.deleted_at is null/);
  });

  it("잡아 둔 것도 쓴 것으로 센다", () => {
    // 예약만 하고 아직 안 끝난 것을 빼고 세면, 같은 팀 둘이 동시에 시작할 때
    // 둘 다 통과해 한도를 넘긴다.
    expect(code).toMatch(/when status = 'reserved' and expires_at > now\(\) then requested_units/);
  });

  it("만료된 예약은 안 센다", () => {
    expect(code).toMatch(/expires_at > now\(\)/);
  });
});

describe("막힌 이유를 갈라서 말한다", () => {
  it("팀 때문이면 따로 알려 준다", () => {
    // 「내 한도를 늘려 달라」고 운영자에게 말해도 안 풀리는 상황이다. 같은
    // 이유로 뭉뚱그리면 사용자가 엉뚱한 곳을 두드린다.
    expect(code).toContain("team_quota_exceeded");
  });

  it("개인 상한만 봤으면 통과했을 때만 팀 탓이다", () => {
    expect(code).toMatch(
      /when v_used \+ v_reserved \+ p_units <= v_profile\.monthly_quota then 'team_quota_exceeded'/,
    );
  });
});

describe("기록에 팀을 적는다", () => {
  it("예약할 때 team_id 를 넣는다", () => {
    // 이게 있어야 다음 달에도 셀 수 있다. 나중에 붙이면 그 사이에 쌓인 기록에
    // 팀이 없어 못 센다.
    expect(code).toMatch(/insert into public\.generation_events \([\s\S]*?team_id/);
    expect(code).toMatch(/v_team_id\s*\n?\s*\);/);
  });
});

describe("화면 숫자와 예약이 같은 답을 낸다", () => {
  it("사용량 요약도 같은 함수를 쓴다", () => {
    // 「남은 크레딧」이 예약이 허락하는 것과 다르면, 화면에는 40 이 남았다고
    // 뜨는데 만들면 막힌다. 그 상태는 고장으로 보인다.
    const summary = code.slice(code.indexOf("function public.member_usage_summary"));
    // 개인 상한을 그대로 돌려주지 않는다. 팀까지 본 값을 돌려준다.
    expect(summary).toMatch(/public\.effective_quota\(/);
    expect(summary).toMatch(/select tm\.team_id from public\.team_members tm where tm\.user_id = profiles\.id/);
  });
});

describe("회원 브라우저에는 안 연다", () => {
  it("새 함수의 권한을 회수한다", () => {
    // 팀 한도와 팀원 사용량을 직접 물을 수 있으면 남의 팀 사정이 새 나간다.
    for (const fn of [
      "public.team_units_used(uuid, date, uuid)",
      "public.effective_quota(uuid, uuid, integer, date)",
    ]) {
      expect(code).toContain(`revoke all on function ${fn} from public, anon, authenticated`);
      expect(code).toContain(`grant execute on function ${fn} to service_role`);
    }
  });

  it("security definer 이고 search_path 를 못 박는다", () => {
    const definers = code.match(/security definer/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(4);
    const paths = code.match(/set search_path = public/g) ?? [];
    expect(paths.length).toBe(definers.length);
  });
});
