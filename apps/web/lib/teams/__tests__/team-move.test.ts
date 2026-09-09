import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **팀을 옮길 때 무엇이 함께 가는가.**
 *
 * `assignMember` 는 `onConflict: "user_id"` upsert 라 소속 변경이 실제로
 * 일어난다. 그런데 두 가지가 그 사실을 못 따라가고 있었다.
 *
 *   - `stampWorkTeam` 이 `team_id IS NULL` 인 것만 달아서, 옮긴 사람의
 *     작업물이 옛 팀에 영구히 남았다. 새 팀장에게는 안 보이고 옛 팀장은
 *     계속 보고 만질 수 있었으며, 「팀 없음」을 골라도 `clearWorkTeam` 은
 *     현재 팀만 푸므로 화면으로는 되돌릴 수 없었다.
 *   - `removeMember`·`setMemberRole` 이 지키는 마지막 팀장 보호를
 *     `assignMember` 만 우회해서, 유일한 팀장을 옮기면 그 팀이 굳었다.
 *
 * 배선을 소스로 지킨다 — Supabase 를 통째로 흉내 내는 것보다 여기서 깨지는
 * 편이 빠르고, 이 두 줄이 사라지는 것이 곧 사고다.
 */
const store = readFileSync(new URL("../store.ts", import.meta.url), "utf8");

describe("팀을 옮기면", () => {
  it("옛 팀에 달린 작업물도 함께 옮긴다", () => {
    expect(store).toContain("async function stampWorkTeam(");
    expect(store).toContain("fromTeamId?: string,");
    // 「팀 없음」에 더해, 떠나는 팀에 달린 것도 새 팀으로 옮긴다.
    expect(store).toMatch(/\.eq\("team_id", fromTeamId\)/);
  });

  it("남의 팀 것을 끌어오지는 않는다", () => {
    // 옮기는 사람이 실제로 떠나는 그 팀만 대상이다.
    expect(store).toContain("if (!fromTeamId || fromTeamId === teamId) continue;");
  });

  it("배정도 마지막 팀장 보호를 받는다", () => {
    const assign = store.slice(store.indexOf("export async function assignMember("));
    expect(assign.slice(0, assign.indexOf("export async function removeMember")))
      .toContain("canRemove(members, userId)");
  });

  it("옮길 때만 검사한다 — 처음 배정되는 사람은 통과한다", () => {
    expect(store).toContain("if (fromTeamId && fromTeamId !== teamId) {");
  });
});
