import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDisabledRoute } from "../../access/routes";
import { GUIDE_TOPICS } from "../../../app/guide/_components/topics";

/**
 * **팀 기능을 고치고 나서 끈다** (2026-09-22 사용자 요청).
 *
 * 고친 것: 운영에서 혼자인 팀의 팀장을 빼면 「server-side exception」이 떴다 — 팀
 * 화면(Digest 2887180017)과 관리자 명단(Digest 4200012665) 둘 다. 서버 기록은
 * 「마지막 팀장은 뺄 수 없습니다」였다. 이제 혼자면 팀을 접고, 막히는 경우에는
 * 오류 화면 대신 그 문구가 화면에 뜬다.
 *
 * 끈 것: 입구만 닫는다. 데이터는 그대로 두고, 켜려면 등록부의 한 줄만 지운다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

describe("팀 기능이 꺼져 있다", () => {
  it("등록부에서 꺼져 있다", () => {
    expect(isDisabledRoute("/team")).toBe(true);
    expect(isDisabledRoute("/team/anything")).toBe(true);
  });

  it("주소를 쳐도 팀 화면이 안 열린다", () => {
    expect(read("app/team/page.tsx")).toContain('if (isDisabledRoute("/team")) redirect(HOME_AFTER_LOGIN);');
  });

  it("사이드바에 팀 메뉴를 안 낸다 — 팀이 남은 사람·운영자에게도", () => {
    expect(read("app/_components/studio-layout.tsx")).toContain('teamEnabled={!isDisabledRoute("/team")}');
    expect(read("../../packages/ui/src/components/app-shell.tsx")).toContain("...(teamEnabled && (hasTeam || isAdmin) ? [teamItem] : [])");
  });

  it("관리자 명단에서 팀 칸을 뺀다", () => {
    expect(read("app/admin/page.tsx")).toContain('teamsEnabled={!isDisabledRoute("/team")}');
    expect(read("app/admin/member-list/member-table.tsx")).toContain('...(teamsEnabled ? ["팀"] : [])');
  });

  it("설명서 목차에서 팀을 뺀다", () => {
    expect(GUIDE_TOPICS.some((topic) => topic.href === "/guide/team")).toBe(false);
    expect(read("app/guide/team/page.tsx")).toContain('if (isDisabledRoute("/team")) redirect("/guide");');
  });

  /** 화면이 닫혀도 서버 액션은 주소만 알면 부를 수 있다. 액션 머리에서도 막는다. */
  it("팀을 바꾸는 액션은 꺼져 있으면 거절한다", () => {
    const team = read("app/team/actions.ts");
    expect(team).toMatch(/async function requireTeamWrite\(teamId: string\): Promise<\{ isAdmin: boolean \}> \{\s*requireTeamOpen\(\);/);
    for (const name of ["createTeamAction", "renameTeamAction", "archiveTeamAction"]) {
      const body = team.slice(team.indexOf(`export async function ${name}`));
      expect(body.slice(0, 300), name).toContain("requireTeamOpen();");
    }
    expect(read("app/admin/actions.ts")).toContain('if (isDisabledRoute("/team")) throw new Error("팀 기능은 지금 꺼 두었습니다.");');
  });

  /** 프로젝트 고르기는 팀이 없는 사람도 쓴다. 팀과 함께 막으면 사이드바가 고장 난다. */
  it("사이드바 프로젝트 고르기는 막지 않는다", () => {
    const team = read("app/team/actions.ts");
    const select = team.slice(team.indexOf("export async function selectProjectAction"), team.indexOf("/* ── 크레딧"));
    expect(select).not.toContain("requireTeamOpen");
    expect(select).not.toContain("requireTeamWrite");
  });

  /** 데이터는 안 지운다. 켜는 날 되돌릴 마이그레이션이 없어야 한다. */
  it("표를 지우는 마이그레이션이 없다", () => {
    expect(read("lib/access/routes.ts")).toContain('{ path: "/team", label: "팀", disabled: true }');
  });
});

describe("오류 화면 대신 사람 말로", () => {
  it("팀 액션은 던지지 않고 돌려보낸다", () => {
    const team = read("app/team/actions.ts");
    const exported = [...team.matchAll(/export async function (\w+)/g)].map((match) => match[1]!);
    for (const name of exported.filter((entry) => entry !== "selectProjectAction")) {
      const start = team.indexOf(`export async function ${name}`);
      const body = team.slice(start, team.indexOf("\n}\n", start));
      expect(body, name).toContain("await attempt(");
    }
  });

  it("관리자 명단의 팀 편성도 던지지 않는다", () => {
    const admin = read("app/admin/actions.ts");
    for (const name of ["assignTeamFromAdmin", "setTeamRoleFromAdmin"]) {
      const start = admin.indexOf(`export async function ${name}`);
      expect(admin.slice(start, start + 200), name).toContain("await adminTeamAttempt(");
    }
  });

  /** `redirect()` 가 던지는 신호를 `catch` 가 삼키면 로그인 화면으로 못 간다. */
  it("문지기의 이동 신호는 다시 던진다", () => {
    expect(read("app/team/actions.ts")).toContain("unstable_rethrow(cause);");
    expect(read("app/admin/actions.ts")).toContain("unstable_rethrow(cause);");
  });

  it("두 화면이 실패 문구를 보여 준다", () => {
    expect(read("app/team/page.tsx")).toContain('role="alert"');
    expect(read("app/admin/page.tsx")).toContain("<AdminError message={shownFailure(params.error)!} />");
  });

  it("뺄 수 없는 사람의 「빼기」는 눌리지 않는다", () => {
    expect(read("app/team/page.tsx")).toContain('disabled={leaveOutcome(team.members, row.userId) === "blocked"}');
  });

  it("예상 못 한 오류에는 오류 번호를 보여 준다", () => {
    const global = read("app/global-error.tsx");
    expect(global).toContain("error.digest");
    expect(global).toContain("오류 번호");
  });
});
