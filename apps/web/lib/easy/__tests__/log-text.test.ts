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
});
