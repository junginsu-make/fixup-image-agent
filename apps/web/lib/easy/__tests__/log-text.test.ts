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

  /**
   * 최종 수정 L3(보안 리뷰). 주소 없이 열쇠 칸만 오거나 저장소의 상대 서명 경로만 와도 비밀이 남는다. 칸 이름은
   * 두고 값만 `<redacted>` 로, 상대 서명 경로는 통째로 `<url>` 로 가린다. 줄바꿈은 빈칸으로 접어 기록 한 줄을
   * 가짜 줄로 쪼개지 못하게 한다.
   */
  it("열쇠 칸(token · apikey · api_key · sig · signature · X-Amz-*)의 값만 가린다", () => {
    expect(errorLogText(new Error("실패 token=AAA&mode=1"))).toBe("실패 token=<redacted>&mode=1");
    expect(errorLogText(new Error("실패 ?apikey=BBB"))).toBe("실패 ?apikey=<redacted>");
    expect(errorLogText(new Error("api_key=CCC; sig=DDD, signature=EEE"))).toBe("api_key=<redacted>; sig=<redacted>, signature=<redacted>");
    expect(errorLogText(new Error("X-Amz-Signature=FFF&X-Amz-Credential=GGG&x-amz-date=1")))
      .toBe("X-Amz-Signature=<redacted>&X-Amz-Credential=<redacted>&x-amz-date=<redacted>");
    expect(errorLogText(new Error("access_token=HHH"))).toBe("access_token=<redacted>");
  });

  it("열쇠와 이름만 닮은 칸은 건드리지 않는다", () => {
    expect(errorLogText(new Error("design=a tokens:3 mysig=x"))).toBe("design=a tokens:3 mysig=x");
  });

  it("저장소의 상대 서명 경로는 통째로 가린다", () => {
    expect(errorLogText(new Error("읽기 실패 /storage/v1/object/sign/poster-assets/u1/a.png?token=SECRET 끝")))
      .toBe("읽기 실패 <url> 끝");
    expect(errorLogText(new Error("읽기 실패 object/sign/poster-assets/u1/a.png?token=SECRET")))
      .toBe("읽기 실패 <url>");
  });

  it("줄바꿈(CR · LF)은 빈칸으로 접는다", () => {
    expect(errorLogText(new Error("첫 줄\r\n[easy] 가짜 줄\n끝\r"))).toBe("첫 줄 [easy] 가짜 줄 끝 ");
  });

  /** 서버 처리 오류 가리기 보안 리뷰 L1 — 주소 없이 오는 열쇠 · 토큰 · 접속 계정도 기록에서 가린다. */
  it("주소 없이 오는 열쇠 · 토큰 · 접속 계정을 가린다", () => {
    const 키 = "sk-proj-" + "a".repeat(24);
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk";
    expect(errorLogText(new Error(`잘못된 키 ${키} 입니다`))).toBe("잘못된 키 <redacted> 입니다");
    expect(errorLogText(new Error(`인증 Bearer ${jwt}`))).toBe("인증 Bearer <redacted>");
    expect(errorLogText(new Error(`토큰 ${jwt} 끝`))).toBe("토큰 <jwt> 끝");
    expect(errorLogText(new Error("fal Key abcdefgh-1234:abcdefgh5678 거절"))).toBe("fal Key <redacted> 거절");
    expect(errorLogText(new Error("접속 postgresql://user:p4ss@db.example:5432/x 실패"))).toBe("접속 <cred>@db.example:5432/x 실패");
    expect(errorLogText(new Error('{"apikey":"abc123secretvalue","x":1}'))).toBe('{"apikey":"<redacted>","x":1}');
    // 닮기만 한 글은 그대로다.
    expect(errorLogText(new Error("risk-free key value password 없음"))).toBe("risk-free key value password 없음");
  });

  it("제어 글자 · 줄 구분 글자를 빈칸으로 접는다(보안 리뷰 L2)", () => {
    expect(errorLogText(new Error("앞\u001b[31m빨강\u2028뒤\u0000끝"))).toBe("앞 [31m빨강 뒤 끝");
  });

  it("긴 글에서도 빠르다(ReDoS)", () => {
    const 시작 = Date.now();
    errorLogText(new Error("a.".repeat(50000) + "sk-" + "b".repeat(100000) + " eyJ".repeat(20000)));
    expect(Date.now() - 시작).toBeLessThan(500);
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
