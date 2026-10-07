import { describe, expect, it } from "vitest";
import { errorLogText } from "../log-text";

/**
 * **서버 기록에도 주소는 남기지 않는다**(2026-10-07 후속 최종 수정 1, 보안 리뷰). 업체 · 저장소 오류 글에는
 * 서명한 주소(토큰이 든 물음표 뒤까지)가 섞여 온다. `see-turn.ts` 와 같은 규칙으로 `<url>` 로 가린다.
 */
describe("서버 기록용 오류 글 (errorLogText)", () => {
  it("오류 글의 주소를 <url> 로 가리고 나머지 글은 남긴다", () => {
    const 오류 = new Error("가져오지 못했습니다 https://abc.supabase.co/storage/v1/object/sign/a.png?token=SECRET 끝");
    expect(errorLogText(오류)).toBe("가져오지 못했습니다 <url> 끝");
  });

  it("http 주소 여럿도 모두 가린다", () => {
    expect(errorLogText(new Error("a http://x.test/1 b https://y.test/2?k=v"))).toBe("a <url> b <url>");
  });

  it("Error 가 아닌 것도 글로 바꿔 가린다", () => {
    expect(errorLogText("실패 https://x.test/s?sig=1")).toBe("실패 <url>");
    expect(errorLogText(undefined)).toBe("undefined");
  });

  it("주소 없는 글은 그대로다", () => {
    expect(errorLogText(new Error('relation "easy_messages" does not exist'))).toBe('relation "easy_messages" does not exist');
  });

  /**
   * 후속 Task 11 (f). Supabase 는 Error 가 아니라 `{ message, code, details }` 덩어리를 준다. 전에는
   * 「[object Object]」만 남아 무슨 오류였는지 기록에서 사라졌다.
   */
  it("Error 가 아니어도 글 message 칸이 있으면 그 글을 쓰고 주소를 가린다", () => {
    const 덩어리 = { message: "저장 실패 https://abc.supabase.co/rest/v1/x?apikey=SECRET", code: "PGRST301", details: null };
    expect(errorLogText(덩어리)).toBe("저장 실패 <url>");
  });

  it("message 칸이 글이 아니면 그 칸을 쓰지 않는다", () => {
    expect(errorLogText({ message: 42 })).toBe("[object Object]");
  });

  /** 기록을 남기다 던지면 원래 처리(일반 문장 응답 · 실패 알림)까지 깨진다. 무엇이 와도 고정 글로 물러난다. */
  it("이상한 값에도 던지지 않고 고정 글로 물러난다", () => {
    const 고정 = errorLogText(Object.create(null));
    expect(typeof 고정).toBe("string");
    expect(고정.length).toBeGreaterThan(0);
    expect(errorLogText({ toString() { throw new Error("못 바꿈"); } })).toBe(고정);
    expect(errorLogText({ get message(): string { throw new Error("못 읽음"); } })).toBe(고정);
    const 이상한Error = new Error("x");
    Object.defineProperty(이상한Error, "message", { get() { throw new Error("못 읽음"); } });
    expect(errorLogText(이상한Error)).toBe(고정);
    expect(errorLogText(Object.assign(new Error("x"), { message: 7 }))).toBe("7");
  });
});
