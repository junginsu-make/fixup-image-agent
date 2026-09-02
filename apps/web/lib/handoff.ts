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

/**
 * 라이브러리에서 고른 그림 한 장.
 *
 * `assetPath` 까지 들고 가야 도구가 그대로 첨부로 쓴다. url 만 있으면
 * 도구에서 다시 올려야 하고, 같은 그림이 창고에 두 벌 쌓인다.
 */
export interface HandoffImage {
  id: string;
  title: string;
  url: string;
  assetPath: string;
}

export interface Handoff {
  title: string;
  text: string;
  url?: string | null;
  candidateId?: string;
  /** 함께 넘길 그림. 글 없이 그림만 넘겨도 된다. */
  images?: HandoffImage[];
}

function readImages(value: unknown): HandoffImage[] {
  if (!Array.isArray(value)) return [];
  // 옛 판이 남아 있거나 사용자가 개발자 도구로 건드렸을 수 있다. 모양인 것만 받는다.
  return value.filter((entry): entry is HandoffImage =>
    Boolean(entry)
    && typeof entry === "object"
    && typeof (entry as HandoffImage).id === "string"
    && typeof (entry as HandoffImage).title === "string"
    && typeof (entry as HandoffImage).url === "string"
    && typeof (entry as HandoffImage).assetPath === "string");
}

export function putHandoff(payload: Handoff): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

/** 짐이 있는지만 본다. 꺼내지 않는다 — 화면을 어느 모드로 열지 정할 때 쓴다. */
export function hasHandoff(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(KEY) !== null;
}

/**
 * 꺼내지 않고 들여다본다.
 *
 * 화면을 어느 모드로 열지 정하려면 내용을 봐야 하는데, 그때 꺼내 버리면
 * 정작 글을 채울 쪽이 빈손이 된다.
 */
export function peekHandoff(): Handoff | null {
  if (typeof window === "undefined") return null;
  return parseHandoff(sessionStorage.getItem(KEY));
}

/** 한 번만 읽힌다. 뒤로 갔다 다시 와도 또 채우지 않는다. */
export function takeHandoff(): Handoff | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  return parseHandoff(raw);
}

function parseHandoff(raw: string | null): Handoff | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Handoff>;
    if (typeof parsed.title !== "string" || typeof parsed.text !== "string") return null;
    return {
      title: parsed.title,
      text: parsed.text,
      url: parsed.url ?? null,
      candidateId: typeof parsed.candidateId === "string" ? parsed.candidateId : undefined,
      images: readImages(parsed.images),
    };
  } catch {
    return null;
  }
}
