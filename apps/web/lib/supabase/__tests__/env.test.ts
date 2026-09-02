import { describe, expect, it } from "vitest";
import { AUTH_UNAVAILABLE_MESSAGE, authAvailability } from "../env";

describe("authAvailability", () => {
  it("공개 환경변수가 둘 다 있으면 인증 화면을 쓸 수 있다", () => {
    expect(
      authAvailability({ url: "https://example.supabase.co", publishableKey: "sb_publishable_x" }),
    ).toEqual({ ready: true, message: "" });
  });

  it("로컬 확인처럼 값이 비어 있으면 제출을 막고 이유를 알린다", () => {
    // .env.local 은 두 값을 빈 문자열로 둔다. undefined 가 아니다.
    expect(authAvailability({ url: "", publishableKey: "" })).toEqual({
      ready: false,
      message: AUTH_UNAVAILABLE_MESSAGE,
    });
  });

  it("한쪽만 있어도 쓸 수 없다", () => {
    expect(authAvailability({ url: "https://example.supabase.co" }).ready).toBe(false);
    expect(authAvailability({ publishableKey: "sb_publishable_x" }).ready).toBe(false);
  });
});
