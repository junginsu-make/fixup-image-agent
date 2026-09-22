import { describe, expect, it } from "vitest";
import { cleanProfileText, missingProfileColumns, PROFILE_LIMITS, profileInputError } from "../profile-extras";

/**
 * 회원 이름·추천인(2026-09-22, 202609220005).
 *
 * 가입 트리거(`public.profile_text`)와 **같은 규칙**으로 다듬어야 한다. 가입 때 들어간 값과
 * 계정 화면에서 고친 값의 모양이 다르면 관리자 검색이 한쪽만 찾는다.
 */
describe("이름·추천인 다듬기", () => {
  it("앞뒤 공백을 걷고 안쪽 공백은 하나로", () => {
    expect(cleanProfileText("  김   철수 ", PROFILE_LIMITS.name)).toBe("김 철수");
  });

  it("빈칸은 null — 빈 문자열과 섞이지 않게", () => {
    expect(cleanProfileText("   ", PROFILE_LIMITS.referrer)).toBeNull();
    expect(cleanProfileText(null, PROFILE_LIMITS.referrer)).toBeNull();
  });

  it("글자 수로 자른다 — 한글도 한 글자", () => {
    expect(cleanProfileText("가".repeat(50), 40)).toBe("가".repeat(40));
  });
});

describe("고칠 때 검사", () => {
  it("이름은 꼭 있어야 한다", () => {
    expect(profileInputError({ name: "  ", referrer: "" })).toBe("이름을 적어 주세요.");
  });

  /** 자르지 않고 알려 준다. 고치는 화면에서 조용히 잘리면 저장된 것이 적은 것과 다르다. */
  it("너무 길면 알려 준다", () => {
    expect(profileInputError({ name: "가".repeat(41), referrer: "" })).toBe("이름은 40자까지 적을 수 있습니다.");
    expect(profileInputError({ name: "김철수", referrer: "나".repeat(101) })).toBe("추천코드는 100자까지 적을 수 있습니다.");
  });

  it("추천인은 비워도 된다", () => {
    expect(profileInputError({ name: "김철수", referrer: "" })).toBeNull();
  });
});

describe("마이그레이션 전 서버", () => {
  /** 칸이 없는 서버에서 읽다가 화면이 통째로 죽으면 안 된다. 그때는 빈 값으로 둔다. */
  it("칸이 없다는 오류만 알아본다", () => {
    expect(missingProfileColumns({ code: "42703" })).toBe(true);
    expect(missingProfileColumns({ code: "PGRST204" })).toBe(true);
    expect(missingProfileColumns({ code: "42501" })).toBe(false);
    expect(missingProfileColumns(null)).toBe(false);
  });
});
