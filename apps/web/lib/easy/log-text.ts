/**
 * **서버 기록에 남길 오류 글**(2026-10-07 후속 최종 수정 1, 보안 리뷰). 오류 덩어리를 그대로 찍지 않는다 —
 * 업체 · 저장소 오류 글에 서명한 주소가 섞여 올 수 있다. 주소는 `<url>` 로 가린다(`see-turn.ts` 와 같은 규칙).
 *
 * 주소 없이 오는 비밀도 가린다(최종 수정 L3, 보안 리뷰). 저장소의 상대 서명 경로는 통째로 `<url>`, 열쇠 칸은
 * 이름을 두고 값만 `<redacted>` 다. 줄바꿈은 빈칸으로 접는다 — 오류 글이 기록 한 줄을 가짜 줄로 쪼개지 못하게.
 */
export function errorLogText(error: unknown): string {
  return 글로(error)
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\S*object\/sign\/\S*/g, "<url>")
    .replace(열쇠칸, "$1<redacted>")
    .replace(/\r\n|\r|\n/g, " ");
}

/** 칸 이름 앞은 글의 처음이거나 구분 글자여야 한다 — `design=` · `mysig=` 같은 남의 칸은 안 건드린다. */
const 열쇠칸 = /((?:^|[\s?&;,"'({])(?:\w*token|apikey|api_key|sig|signature|x-amz-[\w-]+)=)[^\s&;,"')}]+/gi;

/** 글로 못 바꿀 때 남길 글. 기록을 남기다 던지면 원래 처리까지 깨진다(후속 Task 11 (f)). */
const 못읽음 = "(오류 내용을 글로 바꾸지 못했습니다)";

/**
 * Supabase 처럼 Error 가 아닌 `{ message, code }` 덩어리는 그 글을 쓴다(전에는 「[object Object]」).
 * 글이 아닌 칸 · 던지는 `toString` · 프로토타입 없는 객체도 던지지 않고 고정 글로 물러난다.
 */
function 글로(error: unknown): string {
  try {
    if (error instanceof Error) return String(error.message);
    if (typeof error === "object" && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    return String(error);
  } catch {
    return 못읽음;
  }
}
