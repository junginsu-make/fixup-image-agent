import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 로컬 확인 모드에서 팀 코드가 터지지 않아야 한다.
 *
 * ── 왜 이 시험이 있나 ─────────────────────────────────────────────
 *
 * 로컬은 **Supabase 환경변수를 비워 두고** 돈다. 그러면
 * `createSupabaseAdminClient()` 가 던진다.
 *
 * 셸(`studio-layout`)이 **모든 화면에서** `myMembership()` 과
 * `listProjectsWithCounts()` 를 부른다. 여기서 안 막으면 로컬로 띄운 순간
 * 라이브러리·카드뉴스·이미지가 **전부 500** 이 된다 — 팀과 아무 상관 없는
 * 화면까지 못 쓰게 된다.
 *
 * 타입 검사도 빌드도 이걸 못 잡는다. 서버를 띄워야 드러나는 종류다.
 */

// 환경변수가 없을 때 실제로 던지는 것을 그대로 흉내 낸다. 이게 이 시험의
// 핵심이다 — 막지 않으면 이 오류가 화면까지 올라간다.
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("Supabase 공개 환경변수가 설정되지 않았습니다.");
  },
}));
vi.mock("server-only", () => ({}));

const original = { ...process.env };

beforeEach(() => {
  // `NODE_ENV` 는 타입이 읽기 전용이라 바로 못 넣는다. 시험 환경은 이미
  // production 이 아니므로 `LOCAL_STORE` 만 켜면 조건이 선다.
  process.env.LOCAL_STORE = "1";
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...original };
});

describe("읽는 자리는 조용히 비어 있다", () => {
  it("내 팀을 물으면 없다고 답한다", async () => {
    const { myMembership } = await import("../store");
    await expect(myMembership("u1")).resolves.toBeNull();
  });

  it("팀 목록은 빈 배열이다", async () => {
    const { listTeams } = await import("../store");
    await expect(listTeams()).resolves.toEqual([]);
  });

  it("프로젝트 목록은 빈 배열이다", async () => {
    // 셸이 화면마다 부르는 자리다. 여기가 던지면 앱 전체가 멈춘다.
    const { listProjectsWithCounts } = await import("../project-store");
    await expect(listProjectsWithCounts("t1")).resolves.toEqual([]);
  });

  it("팀 작업물도 빈 배열이다", async () => {
    const { listTeamWorks } = await import("../project-store");
    await expect(listTeamWorks("t1")).resolves.toEqual([]);
  });

  it("크레딧은 정하지 않은 것으로 답한다", async () => {
    const { teamCredit } = await import("../store");
    await expect(teamCredit("t1")).resolves.toEqual({ quota: 0, members: [] });
  });
});

describe("쓰는 자리는 사람이 읽을 수 있는 말로 막는다", () => {
  it("팀 만들기", async () => {
    // 조용히 성공한 척하면 로컬에서 팀을 만든 줄 알게 된다.
    const { createTeam } = await import("../store");
    await expect(createTeam("마케팅팀", "u1")).rejects.toThrow("로컬 확인 모드");
  });

  it("팀원 배정", async () => {
    const { assignMember } = await import("../store");
    await expect(assignMember("u1", "t1")).rejects.toThrow("로컬 확인 모드");
  });

  it("프로젝트 만들기", async () => {
    const { createProject } = await import("../project-store");
    await expect(createProject("t1", "봄 신상", "u1")).rejects.toThrow("로컬 확인 모드");
  });
});

describe("운영에서는 그대로 저장소를 본다", () => {
  it("로컬 모드가 아니면 막지 않는다", async () => {
    // 막는 조건이 `LOCAL_STORE` 하나뿐이어야 한다. 운영에서 조용히 빈
    // 목록이 나오면 「팀이 사라졌다」가 된다.
    process.env.LOCAL_STORE = "";
    vi.resetModules();
    const { myMembership } = await import("../store");
    await expect(myMembership("u1")).rejects.toThrow("환경변수");
  });
});
