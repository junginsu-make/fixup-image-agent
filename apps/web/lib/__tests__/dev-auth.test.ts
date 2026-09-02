import { describe, expect, it } from "vitest";
import { LOCAL_BYPASS_ENTRY, localBypassRedirect } from "../dev-auth";

describe("localBypassRedirect", () => {
  it("로컬 확인 모드에서 인증 화면은 스튜디오로 보낸다", () => {
    // 로컬은 Supabase 공개 환경변수를 비워 두므로 이 화면들은 어차피 못 쓴다.
    // 그대로 두면 사용자가 막힌 문을 두드리게 된다.
    for (const path of ["/login", "/signup", "/forgot-password", "/reset-password"]) {
      expect(localBypassRedirect(path)).toBe(LOCAL_BYPASS_ENTRY);
    }
  });

  it("나머지 경로는 건드리지 않는다", () => {
    for (const path of ["/", "/create", "/sns", "/poster", "/library", "/demo"]) {
      expect(localBypassRedirect(path)).toBeNull();
    }
  });

  it("메일 링크 처리 경로는 그대로 지나간다", () => {
    // /auth/confirm 은 화면이 아니라 처리기다. 가로채면 인증이 끊긴다.
    expect(localBypassRedirect("/auth/confirm")).toBeNull();
    expect(localBypassRedirect("/auth/signout")).toBeNull();
  });
});
