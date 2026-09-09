import { describe, expect, it } from "vitest";
import {
  TEAM_SCOPED_TABLES,
  canAssignMember,
  canDemote,
  canWriteTeam,
  canRemove,
  normalizeTeamName,
  planAssign,
  summarize,
  teamNameError,
} from "../core";

describe("팀 이름", () => {
  it("앞뒤 공백을 뗀다", () => {
    expect(normalizeTeamName("  마케팅팀  ")).toBe("마케팅팀");
  });

  it("가운데 여러 칸을 하나로 줄인다", () => {
    // 「마케팅  팀」과 「마케팅 팀」이 다른 팀이 되면, 목록에서 둘이 나란히
    // 서고 어느 쪽에 넣었는지 알 수 없다.
    expect(normalizeTeamName("마케팅   팀")).toBe("마케팅 팀");
  });

  it("빈 이름을 막는다", () => {
    expect(teamNameError("")).toContain("적어 주세요");
    expect(teamNameError("   ")).toContain("적어 주세요");
  });

  it("너무 긴 이름을 막는다", () => {
    expect(teamNameError("가".repeat(61))).toContain("60자");
    expect(teamNameError("가".repeat(60))).toBeNull();
  });

  it("다듬은 뒤 길이를 잰다", () => {
    // 공백으로 60자를 넘겨 놓고 통과시키면 DB 의 check 에서 막힌다.
    expect(teamNameError(`  ${"가".repeat(60)}  `)).toBeNull();
  });
});

describe("팀에 넣으면 만들어 둔 것도 따라간다", () => {
  it("여섯 표를 함께 옮긴다", () => {
    // 안 가져가면 팀에 넣어도 팀장이 볼 것이 하나도 없다. 팀을 만든 날
    // 화면이 텅 빈다.
    const plan = planAssign("u1", "t1", "member");
    expect(plan.tables).toEqual(TEAM_SCOPED_TABLES);
    expect(plan.tables.length).toBe(6);
  });

  it("자식 표는 안 옮긴다", () => {
    // 자식은 부모를 통해 판정한다. 양쪽에 달면 둘이 어긋난다.
    for (const child of ["sns_cards", "poster_images", "library_images", "character_views"]) {
      expect(TEAM_SCOPED_TABLES).not.toContain(child);
    }
  });

  it("정산 기록은 안 옮긴다", () => {
    // 지난달 쓴 것이 팀 몫으로 바뀌면 장부가 흔들린다. 팀 정산은 배정한
    // 뒤에 쌓이는 것부터다.
    expect(TEAM_SCOPED_TABLES).not.toContain("generation_events");
  });

  it("맡은 자리를 그대로 담는다", () => {
    expect(planAssign("u1", "t1", "leader").role).toBe("leader");
  });
});

describe("팀장 없는 팀을 만들지 않는다", () => {
  const two = [
    { userId: "a", role: "leader" as const },
    { userId: "b", role: "member" as const },
  ];
  const twoLeaders = [
    { userId: "a", role: "leader" as const },
    { userId: "b", role: "leader" as const },
  ];

  it("마지막 팀장은 못 내린다", () => {
    // 팀장이 없는 팀은 아무도 팀원을 넣거나 뺄 수 없어 그대로 굳는다.
    expect(canDemote(two, "a")).toBe(false);
  });

  it("팀장이 둘이면 내릴 수 있다", () => {
    expect(canDemote(twoLeaders, "a")).toBe(true);
  });

  it("팀원은 언제든 내릴 수 있다 — 이미 팀원이다", () => {
    expect(canDemote(two, "b")).toBe(true);
  });

  it("마지막 팀장은 못 뺀다", () => {
    expect(canRemove(two, "a")).toBe(false);
    expect(canRemove(two, "b")).toBe(true);
  });

  it("팀에 없는 사람은 막지 않는다", () => {
    expect(canDemote(two, "없는사람")).toBe(true);
  });

  it("빈 팀에서도 안 터진다", () => {
    expect(canDemote([], "a")).toBe(true);
  });
});

describe("맨 줄에 거는 숫자", () => {
  it("미배정을 센다", () => {
    const s = summarize([{}, {}], 8, 12);
    expect(s).toMatchObject({ teams: 2, assigned: 8, unassigned: 4 });
    expect(s.ratio).toBeCloseTo(8 / 12);
  });

  it("회원이 없어도 0 으로 안 나눈다", () => {
    expect(summarize([], 0, 0)).toMatchObject({ ratio: 0, unassigned: 0 });
  });

  it("배정 수가 회원 수를 넘겨도 음수가 안 나온다", () => {
    // 세는 시점이 갈리면 잠깐 그럴 수 있다. 화면에 「미배정 -1」이 뜨면 안 된다.
    expect(summarize([], 5, 3).unassigned).toBe(0);
  });

  it("전원 배정이면 미배정이 0 이다", () => {
    expect(summarize([{}], 4, 4)).toMatchObject({ unassigned: 0, ratio: 1 });
  });
});

describe("팀을 꾸릴 수 있는 사람", () => {
  const leaderHere = { teamId: "t1", role: "leader" as const };
  const leaderThere = { teamId: "t2", role: "leader" as const };
  const memberHere = { teamId: "t1", role: "member" as const };

  it("운영자는 모든 팀을 꾸린다", () => {
    expect(canWriteTeam(true, null, "t1")).toBe(true);
    expect(canWriteTeam(true, leaderThere, "t1")).toBe(true);
  });

  it("팀장은 자기 팀만 꾸린다", () => {
    expect(canWriteTeam(false, leaderHere, "t1")).toBe(true);
  });

  it("남의 팀 ID 를 적어 보내도 안 통한다", () => {
    // 폼이 팀 ID 를 실어 보낸다. 「팀장인가」만 묻고 통과시키면 다른 팀
    // ID 하나로 아무 팀이나 꾸릴 수 있게 된다.
    expect(canWriteTeam(false, leaderThere, "t1")).toBe(false);
  });

  it("팀원은 못 꾸린다", () => {
    expect(canWriteTeam(false, memberHere, "t1")).toBe(false);
  });

  it("소속 없는 사람은 못 꾸린다", () => {
    expect(canWriteTeam(false, null, "t1")).toBe(false);
  });
});

describe("배정할 수 있는 대상", () => {
  it("운영자는 남의 팀 사람도 옮긴다", () => {
    // 팀 사이를 옮기는 일이 운영자 몫이다.
    expect(canAssignMember(true, "t2", "t1")).toBe(true);
  });

  it("팀장은 아직 팀이 없는 사람을 넣는다", () => {
    expect(canAssignMember(false, null, "t1")).toBe(true);
  });

  it("팀장은 이미 우리 팀인 사람을 다시 넣을 수 있다", () => {
    // 이 함수가 답하는 것은 「끌어와도 되나」 하나뿐이다. 그 사람을 팀원으로
    // 내려도 되는지는 마지막 팀장 규칙(`canDemote`)이 따로 본다 — 두 질문을
    // 한 함수에 섞으면 나중에 한쪽만 고쳐진다.
    expect(canAssignMember(false, "t1", "t1")).toBe(true);
  });

  it("팀장은 남의 팀 사람을 끌어오지 못한다", () => {
    // 회원 ID 는 폼이 실어 보낸다. 넣는 자리만 보고 통과시키면, 남의 팀
    // 사람 ID 하나로 그 사람을 원래 팀에서 빼내 이쪽으로 옮길 수 있다 —
    // 배정이 `user_id` 로 덮어쓰기 때문이다.
    expect(canAssignMember(false, "t2", "t1")).toBe(false);
  });
});
