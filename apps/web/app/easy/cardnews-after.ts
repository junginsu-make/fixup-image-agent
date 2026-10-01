import { CARD_LANGUAGE_LABEL, CARD_LANGUAGES } from "./cardnews-options";

/**
 * **만든 카드뉴스 손보기의 판단**(3단계 설계 `2026-10-01-easy-cardnews-after-design.md`).
 *
 * 한 장 다시 만들기 · 한 장 글 고치기 · 게시글 · 전부 받기. 화면과 서버가 같은 값을 쓴다.
 * 화면 안에 두면 값으로 못 잰다.
 */

export interface AfterCard {
  index: number;
  role: string;
  kind?: string;
  status: string;
  assetPath?: string;
  assetUrl?: string;
  copy: { headline: string; body?: string; accent?: string; footnote?: string };
}

export interface AfterProject {
  title?: string;
  status: string;
  language: string;
  data: { flow?: { cards: AfterCard[] } };
}

export interface CopyPatch { headline?: string; body?: string; accent?: string; footnote?: string }
export interface Caption { hook: string; body: string; hashtags: string[]; firstComment: string }

export const NOT_MADE_YET = "아직 만든 카드가 없습니다. 원고 밑 「이대로 만들기」를 먼저 눌러 주세요.";
export const ASK_CARD_NUMBER = "몇 번 장인가요? 예: 「3번 다시 그려줘」";

const 그림있는상태 = new Set(["done", "review_required", "failed"]);

/**
 * **만든 작업**(설계 §3). 그림이 한 장이라도 있으면(실패한 장 포함) 만든 작업이다.
 *
 * 상태(`status`)로 가르지 않는다. 한 장 글을 저장하면 카드뉴스 라우트가 상태를
 * `copy_ready` 로 되돌려(`cards/[index]/route.ts:58`), 상태로 가르면 「이대로 만들기」가
 * 다시 나오고 누르면 전 장 값이 나간다(설계 §2 위험).
 */
export function isMade(project: { data: { flow?: { cards: ReadonlyArray<{ status: string; assetPath?: string }> } } }): boolean {
  return (project.data.flow?.cards ?? []).some((card) => 그림있는상태.has(card.status) || Boolean(card.assetPath));
}

export function cardAt(project: AfterProject, index: number): AfterCard | undefined {
  return (project.data.flow?.cards ?? []).find((card) => card.index === index);
}

/** 다시 만들기 전 보관하는 앞 그림의 이름(라이브러리 참고 이미지). */
export function archiveTitle(title: string, index: number): string {
  return `${title.trim() || "카드뉴스"} · ${index}번 장 이전 그림`;
}

/** 말로 한 장 글을 고칠 때 글 모델에 줄 부탁(설계 §6-2). */
export function cardEditPrompt(project: AfterProject, index: number, words: string): string {
  const card = cardAt(project, index);
  const 언어 = CARD_LANGUAGE_LABEL[project.language as (typeof CARD_LANGUAGES)[number]] ?? "한국어";
  return [
    `카드뉴스 ${index}번 장의 글을 사용자의 말대로 고칩니다.`,
    "",
    "지금 글:",
    `- headline: ${card?.copy.headline ?? ""}`,
    `- body: ${card?.copy.body ?? ""}`,
    `- accent: ${card?.copy.accent ?? ""}`,
    `- footnote: ${card?.copy.footnote ?? ""}`,
    "",
    `사용자의 말: ${words}`,
    "",
    "규칙:",
    "- 말이 가리키는 칸만 고칩니다. 안 고칠 칸은 빈 글로 둡니다.",
    "- 지금 글에 없는 사실 · 숫자 · 기관 이름을 새로 넣지 않습니다.",
    `- ${언어}로 씁니다.`,
  ].join("\n");
}

const 칸상한 = { headline: 80, body: 400, accent: 120, footnote: 160 } as const;

/** 고친 글을 다듬는다. 빈 칸은 안 바꾼 것으로 본다. 바꿀 것이 없으면 `undefined`. */
export function readCardEdit(raw: unknown): CopyPatch | undefined {
  const value = (raw ?? {}) as Record<string, unknown>;
  const patch = Object.fromEntries(
    (Object.keys(칸상한) as Array<keyof typeof 칸상한>).flatMap((key) => {
      const text = typeof value[key] === "string" ? (value[key] as string).trim() : "";
      return text ? [[key, text.slice(0, 칸상한[key])]] : [];
    }),
  ) as CopyPatch;
  return Object.keys(patch).length ? patch : undefined;
}

/** 전부 받기: 그림이 있는 장만. */
export function downloadList(view: { cards: ReadonlyArray<{ index: number; url?: string }> }): Array<{ index: number; url: string }> {
  return view.cards.flatMap((card) => (card.url ? [{ index: card.index, url: card.url }] : []));
}

/** 게시글을 복사할 한 덩이로. */
export function captionText(caption: Caption): string {
  const 태그 = caption.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ");
  return [caption.hook, caption.body, 태그, caption.firstComment ? `첫 댓글: ${caption.firstComment}` : ""]
    .filter(Boolean).join("\n\n");
}
