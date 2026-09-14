import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_DELETE_MESSAGE,
  OWNER_EMAIL_FALLBACK,
  OWNER_PROTECTED_MESSAGE,
  canDeleteAdmin,
  canManageTarget,
  isOwnerEmail,
  resolveOwnerEmail,
} from "../owner";

/**
 * 소유자 보호.
 *
 * 관리자가 둘이 되면서 서로를 지우거나 정지시킬 수 있게 되었다. 한 번의
 * 실수로 되돌릴 수 없는 사고가 난다 — 관리자를 되살리는 길은 화면에 없고
 * DB 를 직접 열어야 하는데, 그 DB 를 여는 사람이 방금 지워진 계정일 수 있다.
 */

const OWNER = "9843ohs@gmail.com";
const SECOND_ADMIN = "ai.dev@fixupworld.com";
const MEMBER = "someone@example.com";

const WEB = process.cwd();
const actions = readFileSync(path.join(WEB, "app/admin/actions.ts"), "utf8");

describe("소유자를 알아본다", () => {
  it("설정이 없으면 기본값을 쓴다", () => {
    expect(resolveOwnerEmail(undefined)).toBe(OWNER_EMAIL_FALLBACK.toLowerCase());
    expect(resolveOwnerEmail(null)).toBe(OWNER_EMAIL_FALLBACK.toLowerCase());
    expect(resolveOwnerEmail("   ")).toBe(OWNER_EMAIL_FALLBACK.toLowerCase());
  });

  /**
   * **기본값을 비워 두지 않는 이유.** 비어 있으면 아무도 보호받지 못하는데,
   * 그 사실은 사고가 난 뒤에야 드러난다.
   */
  it("기본값이 비어 있지 않다", () => {
    expect(OWNER_EMAIL_FALLBACK.trim().length).toBeGreaterThan(0);
    expect(OWNER_EMAIL_FALLBACK).toContain("@");
  });

  it("설정이 있으면 그것을 쓴다", () => {
    expect(resolveOwnerEmail("Boss@Example.com")).toBe("boss@example.com");
  });

  /** 사람이 손으로 적는 값이라 대소문자와 공백이 섞인다. */
  it("대소문자와 공백을 무시하고 견준다", () => {
    expect(isOwnerEmail("  9843OHS@Gmail.com ", OWNER)).toBe(true);
  });

  /** 빈 주소가 소유자로 통과하면, 주소를 못 읽은 것이 곧 권한이 된다. */
  it("빈 주소는 소유자가 아니다", () => {
    for (const empty of ["", "   ", null, undefined]) {
      expect(isOwnerEmail(empty, OWNER)).toBe(false);
    }
  });
});

describe("누가 누구를 손댈 수 있나", () => {
  it("소유자는 둘째 관리자를 손댄다", () => {
    expect(canManageTarget({ actorEmail: OWNER, targetEmail: SECOND_ADMIN, owner: OWNER })).toBe(true);
  });

  /** 이번 요구의 핵심이다. */
  it("둘째 관리자는 소유자를 못 손댄다", () => {
    expect(canManageTarget({ actorEmail: SECOND_ADMIN, targetEmail: OWNER, owner: OWNER })).toBe(false);
  });

  it("둘째 관리자도 일반 회원은 손댄다", () => {
    expect(canManageTarget({ actorEmail: SECOND_ADMIN, targetEmail: MEMBER, owner: OWNER })).toBe(true);
  });

  it("소유자는 자기도 손댄다", () => {
    expect(canManageTarget({ actorEmail: OWNER, targetEmail: OWNER, owner: OWNER })).toBe(true);
  });

  /** 부르는 쪽의 주소를 못 읽었다면 소유자로 쳐 주지 않는다. */
  it("주소를 모르는 사람은 소유자를 못 손댄다", () => {
    for (const unknown of ["", null, undefined]) {
      expect(canManageTarget({ actorEmail: unknown, targetEmail: OWNER, owner: OWNER })).toBe(false);
    }
  });
});

describe("관리자 지우기", () => {
  it("소유자만 관리자를 지운다", () => {
    expect(canDeleteAdmin(OWNER, OWNER)).toBe(true);
    expect(canDeleteAdmin(SECOND_ADMIN, OWNER)).toBe(false);
    expect(canDeleteAdmin(null, OWNER)).toBe(false);
  });
});

describe("왜 막혔는지 말한다", () => {
  it("두 안내문이 서로 다르고 비어 있지 않다", () => {
    expect(OWNER_PROTECTED_MESSAGE.length).toBeGreaterThan(10);
    expect(ADMIN_DELETE_MESSAGE.length).toBeGreaterThan(10);
    expect(OWNER_PROTECTED_MESSAGE).not.toBe(ADMIN_DELETE_MESSAGE);
  });
});

describe("관리자 화면이 실제로 이 문을 쓴다", () => {
  /**
   * **화면에서 단추를 감추는 것으로는 못 막는다.** 서버 액션은 주소만 알면
   * 직접 부를 수 있다. 회원 하나를 바꾸는 모든 액션이 이 문을 지나야 한다.
   */
  const guarded = [
    "approveMember",
    "setMemberStatus",
    "updateQuota",
    "resendApproval",
    "resendConfirmation",
    "deleteMember",
    "assignTeamFromAdmin",
    "setTeamRoleFromAdmin",
  ];

  for (const name of guarded) {
    it(`${name} 이 문을 지난다`, () => {
      const at = actions.indexOf(`export async function ${name}(`);
      expect(at).toBeGreaterThan(0);
      const next = actions.indexOf("\nexport ", at + 10);
      const body = actions.slice(at, next < 0 ? actions.length : next);
      expect(body).toContain("requireAdminFor(");
    });
  }

  /**
   * 문이 이미 대상을 읽어 온다. 옛 조회를 그대로 두면 같은 줄을 두 번 읽고,
   * 두 값이 갈리면 어느 쪽으로 판단했는지 알 수 없게 된다.
   *
   * 쓰기(`update`)는 그대로 있어야 한다 — 읽기만 본다.
   */
  it("문을 지나는 액션이 프로필을 다시 읽지 않는다", () => {
    for (const name of ["setMemberStatus", "resendApproval", "resendConfirmation", "deleteMember"]) {
      const at = actions.indexOf(`export async function ${name}(`);
      const next = actions.indexOf("\nexport ", at + 10);
      const body = actions.slice(at, next < 0 ? actions.length : next);
      expect(body).not.toContain("const { data: profile");
    }
  });

  /**
   * **문을 부르는 것만으로는 부족하다.**
   *
   * 처음에는 각 액션이 `requireAdminFor()` 를 부르는지만 봤다. 그런데 문
   * 안쪽의 검사를 통째로 들어내도 시험이 전부 통과했다 — 문은 있는데 잠겨
   * 있지 않은 상태를 못 잡은 것이다. 문 안쪽도 본다.
   */
  it("문 자체가 실제로 막는다", () => {
    const at = actions.indexOf("async function requireAdminFor(");
    expect(at).toBeGreaterThan(0);
    const body = actions.slice(at, actions.indexOf("\n}", at) + 2);

    expect(body).toContain("canManageTarget(");
    expect(body).toContain("OWNER_PROTECTED_MESSAGE");
    expect(body).toContain("throw new Error");
    // 부르는 사람의 주소로 판단해야 한다. 넘겨받은 값을 믿으면 뚫린다.
    expect(body).toContain("current.profile.email");
  });

  it("관리자 지우기가 소유자만 통과시킨다", () => {
    const at = actions.indexOf("export async function deleteMember(");
    const body = actions.slice(at, actions.indexOf("\nexport ", at + 10));
    expect(body).toContain("canDeleteAdmin(");
    expect(body).toContain("자기 계정은 지울 수 없습니다");
  });
});
