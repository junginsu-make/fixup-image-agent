import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **계정 화면(마이페이지)** — 2026-09-22 사용자 요청.
 *
 * 이름·이메일·비밀번호·추천인을 보고 고친다. 「내 디자인 레퍼런스」는 뺀다(라이브러리가
 * 같은 일을 한다). 관리자 회원 관리에서도 이름·추천인을 보고, 비밀번호를 재설정 메일이나
 * 직접 지정으로 바꾼다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

describe("계정 화면", () => {
  const page = read("app/settings/page.tsx");

  it("「내 디자인 레퍼런스」 칸이 없고 라이브러리로 안내한다", () => {
    expect(page).not.toContain("StyleReferenceManager");
    expect(existsSync(join(web, "app/settings/StyleReferenceManager.tsx"))).toBe(false);
    expect(page).toContain('href="/library"');
  });

  it("이름·추천인을 보여 주고 고친다", () => {
    expect(page).toContain("<ProfileCard");
    expect(read("app/settings/profile-card.tsx")).toContain("updateMyProfile");
  });

  /** 폼에서 회원 ID 를 받으면 남의 ID 를 적어 남의 이름을 바꿀 수 있다. */
  it("내 것만 고친다 — 회원 ID 를 받지 않는다", () => {
    const actions = read("app/settings/actions.ts");
    expect(actions).toContain("updateProfileExtras(member.user.id,");
    expect(actions).not.toMatch(/userId/);
  });

  /** `updateUser` 는 현재 비밀번호를 묻지 않는다. 열린 브라우저를 잡은 사람이 계정을 가져간다. */
  it("이메일·비밀번호는 현재 비밀번호를 확인한 뒤에 바꾼다", () => {
    const login = read("app/settings/login-card.tsx");
    for (const form of ["function EmailForm", "function PasswordForm"]) {
      const body = login.slice(login.indexOf(form));
      expect(body.indexOf("confirmCurrent("), form).toBeGreaterThan(-1);
      expect(body.indexOf("confirmCurrent("), form).toBeLessThan(body.indexOf("updateUser("));
    }
  });

  /**
   * 우리가 다른 기기를 끊지는 않는다(이 시스템에만 적용). 다만 **비밀번호를 바꾸면 Supabase 가
   * 다른 기기의 로그인을 풀 수 있어서** 그렇게 말한다 — 「그대로 유지」라고 약속하면 거짓말이
   * 된다(독립 리뷰 2026-09-22).
   */
  it("다른 기기를 일부러 끊지 않고, 비밀번호는 다시 로그인할 수 있다고 말한다", () => {
    const login = read("app/settings/login-card.tsx");
    expect(login).not.toContain('scope: "global"');
    expect(login).toContain("비밀번호를 바꾸면 다른 기기에서는 다시 로그인해야 할 수 있습니다");
  });

  it("소유자는 여기서 이메일을 바꾸지 않는다 — 소유자 보호가 이메일로 걸려 있다", () => {
    expect(read("app/settings/login-card.tsx")).toContain("{owner ? (");
    expect(read("app/settings/page.tsx")).toContain("owner={isOwnerEmail(");
  });

  it("이메일은 바로 안 바뀐다고 말한다", () => {
    expect(read("app/settings/login-card.tsx")).toContain("메일의 링크를 눌러야 이메일이 바뀝니다");
  });

  /** 모든 화면이 쓰는 회원 조회에 새 칸을 넣으면, 마이그레이션 전 서버에서 전부 죽는다. */
  it("이름·추천인은 따로 읽는다 — 공용 회원 조회에 안 넣는다", () => {
    expect(read("lib/membership/server.ts")).not.toContain("display_name");
  });
});

describe("가입", () => {
  const signup = read("app/signup/page.tsx");
  it("이름은 꼭, 추천인은 골라서 받는다", () => {
    expect(signup).toContain('htmlFor="name"');
    expect(signup).toContain('htmlFor="referrer"');
    expect(signup).toContain("display_name: cleanProfileText(name");
    expect(signup).toContain("referrer_input: cleanProfileText(referrer");
  });
});

describe("관리자 회원 관리", () => {
  it("한 줄에 이름·추천인이 보인다", () => {
    const table = read("app/admin/member-list/member-table.tsx");
    expect(table).toContain("row.name");
    expect(table).toContain("추천인(적은 값)");
  });

  it("비밀번호를 재설정 메일과 직접 지정으로 바꾼다", () => {
    const info = read("app/admin/member-list/member-info.tsx");
    expect(info).toContain("adminSendPasswordReset(");
    expect(info).toContain("adminSetMemberPassword(");
  });

  /** 소유자 계정은 다른 관리자가 못 건드린다. 비밀번호도 마찬가지다. */
  it("세 액션 모두 소유자 보호를 거친다", () => {
    const actions = read("app/admin/actions.ts");
    const helper = actions.slice(actions.indexOf("async function memberAttempt"));
    expect(helper.slice(0, 600)).toContain("await requireAdminFor(userId)");
    for (const name of ["adminUpdateMemberProfile", "adminSendPasswordReset", "adminSetMemberPassword"]) {
      const start = actions.indexOf(`export async function ${name}`);
      expect(actions.slice(start, start + 250), name).toContain("return memberAttempt(userId,");
    }
  });

  /** action_link 는 토큰을 주소 뒤(#)에 싣는다. 서버 라우트는 그걸 못 읽어 로그인 오류로 간다. */
  it("재설정 메일 주소는 서버가 확인할 수 있는 모양이다", () => {
    const actions = read("app/admin/actions.ts");
    expect(actions).toContain('url.searchParams.set("token_hash", hashedToken);');
    expect(actions).toContain('url.searchParams.set("type", "recovery");');
    expect(actions).toContain("sendPasswordResetEmail(target.email, recoveryUrl(siteUrl, hashed))");
  });

  it("다른 관리자의 비밀번호는 소유자만 바꾼다", () => {
    const actions = read("app/admin/actions.ts");
    for (const name of ["adminSendPasswordReset", "adminSetMemberPassword"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`));
      expect(body.slice(0, 700), name).toContain("adminPasswordGuard(target, current.profile.email)");
    }
  });

  it("비밀번호 자체는 기록에 남기지 않는다", () => {
    const actions = read("app/admin/actions.ts");
    const body = actions.slice(actions.indexOf("export async function adminSetMemberPassword"));
    expect(body).toContain('console.info("[admin] 비밀번호 직접 지정", { actor: current.user.id, target: userId });');
  });
});
