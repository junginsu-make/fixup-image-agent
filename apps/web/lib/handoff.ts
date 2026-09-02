/**
 * 라이브러리에서 도구로 넘기는 짐.
 *
 * 사용자가 복사해 붙일 필요가 없어야 한다. 라이브러리에서 「카드뉴스로」를
 * 누르면 그 글이 만들기 화면에 이미 들어가 있다.
 *
 * 세션에만 둔다 — 한 번 쓰고 버리는 값이라 DB 에 넣을 이유가 없다.
 * 서버를 거치지 않으므로 새 테이블도, 새 라우트도 필요 없다.
 */

const KEY = "fixup:handoff";

export interface Handoff {
  title: string;
  text: string;
  url?: string | null;
  candidateId?: string;
}

export function putHandoff(payload: Handoff): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

/** 한 번만 읽힌다. 뒤로 갔다 다시 와도 또 채우지 않는다. */
export function takeHandoff(): Handoff | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    const parsed = JSON.parse(raw) as Partial<Handoff>;
    if (typeof parsed.title !== "string" || typeof parsed.text !== "string") return null;
    return {
      title: parsed.title,
      text: parsed.text,
      url: parsed.url ?? null,
      candidateId: typeof parsed.candidateId === "string" ? parsed.candidateId : undefined,
    };
  } catch {
    return null;
  }
}
