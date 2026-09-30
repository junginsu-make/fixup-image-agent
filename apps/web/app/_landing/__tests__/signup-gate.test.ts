import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loginHrefFor, readSignupGate } from "../signup-gate";

/**
 * 첫 화면의 회원가입 안내 (2026-09-30 사용자, 설계 §3.5 · D3).
 *
 * 미들웨어가 비회원을 `/?signup=required&next=/create` 로 보낸다. 첫 화면은 이
 * 주소만 보고 모달을 연다 — 무엇을 읽는지가 이 파일의 시험이다.
 */
describe("readSignupGate", () => {
  it("signup=required 면 열고 가려던 곳을 싣는다", () => {
    expect(readSignupGate({ signup: "required", next: "/create" })).toEqual({ open: true, next: "/create" });
  });

  it.each([undefined, "", "yes", "REQUIRED"])("signup 이 %s 면 열지 않는다", (signup) => {
    expect(readSignupGate({ signup, next: "/create" })).toEqual({ open: false, next: null });
  });

  it("같은 이름이 두 번 오면 첫 값을 쓴다", () => {
    expect(readSignupGate({ signup: ["required", "x"], next: ["/sns", "/poster"] })).toEqual({ open: true, next: "/sns" });
  });

  it("가려던 곳이 없어도 연다 — [로그인] 은 그냥 로그인 화면으로 간다", () => {
    expect(readSignupGate({ signup: "required" })).toEqual({ open: true, next: null });
  });

  /** 로그인 화면이 다시 거르지만, 우리 화면이 그런 주소를 만들어 내보내지 않는다. */
  it.each(["//evil.example.com", "https://evil.example.com", "evil.example.com", "/\\evil.example.com"])(
    "밖으로 나가는 next(%s) 는 버린다",
    (next) => {
      expect(readSignupGate({ signup: "required", next })).toEqual({ open: true, next: null });
    },
  );
});

describe("loginHrefFor", () => {
  it("가려던 곳을 로그인 화면에 넘긴다", () => {
    expect(loginHrefFor("/create")).toBe("/login?next=%2Fcreate");
    expect(loginHrefFor("/sns/abc123")).toBe("/login?next=%2Fsns%2Fabc123");
  });

  it("없으면 그냥 로그인 화면", () => {
    expect(loginHrefFor(null)).toBe("/login");
  });
});

/**
 * 첫 화면은 서버 컴포넌트라 여기서 그려 볼 수 없다(DB·쇼케이스를 부른다).
 * 파일을 글자로 읽어 배선을 맞댄다 — 이 저장소의 `header-and-about.test.ts` 방식.
 */
describe("첫 화면 배선", () => {
  const page = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");

  it("주소의 signup·next 를 읽는다", () => {
    expect(page).toContain("readSignupGate({ signup, next })");
  });

  it("로그인한 사람에게는 띄우지 않는다 — 뒤로 가기·즐겨찾기로 이 주소를 다시 열 수 있다", () => {
    expect(page).toContain("gate.open && !signedIn");
  });

  it("모달을 그린다", () => {
    expect(page).toContain("<SignupRequiredModal");
  });
});

describe("모달은 공용 Dialog 를 쓴다", () => {
  const modal = readFileSync(path.join(process.cwd(), "app/_landing/signup-required-modal.tsx"), "utf8");

  it("@fixup/ui 의 Dialog 계열이다 — Radix 를 직접 부르지 않는다", () => {
    expect(modal).toContain('from "@fixup/ui"');
    expect(modal).toContain("DialogContent");
    expect(modal).not.toContain("@radix-ui");
  });
});
