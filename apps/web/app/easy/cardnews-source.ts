/**
 * **카드뉴스 원고를 무엇으로 쓸까**(2단계 설계 §6). 코드가 가른다 — 값으로 잰다.
 *
 * 말에서 찾는다: 유튜브 주소 · 다른 주소 · 긴 글 · 짧은 주제. 카드뉴스 라우트의
 * 네 갈래(`app/api/sns/projects/schema.ts` 의 `SourceSchema`)와 같은 모양이다.
 */

export type CardSource =
  | { kind: "text"; text: string }
  | { kind: "youtube"; url: string }
  | { kind: "web"; url: string }
  | { kind: "question"; question: string };

/** 이만큼 길면 붙여 넣은 글로 본다. 첫 값이다 — 실측으로 고친다. */
export const LONG_TEXT = 300;

export const WEB_OFF = "기사 주소는 아직 읽지 못합니다. 기사 내용을 붙여 넣어 주세요.";

const 주소 = /https?:\/\/[^\s<>"'「」『』]+/i;
const 유튜브 = /^(www\.|m\.)?(youtube\.com|youtu\.be)$/i;
const 끝문장부호 = /[.,)\]」』>]+$/;

export function cardSourceLabel(kind: CardSource["kind"]): string {
  return {
    youtube: "유튜브 영상의 자막으로 썼어요",
    web: "기사 주소의 내용으로 썼어요",
    text: "붙여 주신 글로 썼어요",
    question: "인터넷에서 찾은 내용으로 썼어요",
  }[kind];
}

export function pickCardSource(
  words: string,
  options: { webEnabled: boolean },
): { ok: true; source: CardSource; label: string } | { ok: false; message: string } {
  const text = words.trim();
  const found = text.match(주소)?.[0]?.replace(끝문장부호, "");
  if (found) {
    let host = "";
    try {
      host = new URL(found).hostname;
    } catch {
      return { ok: false, message: "주소를 읽지 못했습니다. 주소를 다시 확인해 주세요." };
    }
    if (유튜브.test(host)) return { ok: true, source: { kind: "youtube", url: found }, label: cardSourceLabel("youtube") };
    if (!options.webEnabled) return { ok: false, message: WEB_OFF };
    return { ok: true, source: { kind: "web", url: found }, label: cardSourceLabel("web") };
  }
  if (text.length >= LONG_TEXT) return { ok: true, source: { kind: "text", text }, label: cardSourceLabel("text") };
  return { ok: true, source: { kind: "question", question: text }, label: cardSourceLabel("question") };
}
