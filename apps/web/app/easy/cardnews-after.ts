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
export const STILL_GENERATING = "카드를 만드는 중입니다. 다 만든 뒤 다시 말씀해 주세요.";

/**
 * **만드는 중**(독립 리뷰). 작업이나 어느 장이 만드는 중이면 글 고치기 · 다시 만들기를 받지 않는다.
 * 카드뉴스의 글 저장은 만드는 중에도 상태를 원고로 되돌려 진행이 끊기고, 다시 만들기는
 * 어차피 거절되는데 앞 그림만 또 보관된다.
 */
export function isGenerating(project: { status: string; data: { flow?: { cards: ReadonlyArray<{ status: string }> } } }): boolean {
  return project.status === "generating" || (project.data.flow?.cards ?? []).some((card) => card.status === "generating");
}

const 그림있는상태 = new Set(["done", "review_required", "failed"]);

/**
 * **AI 가 그린 장의 제 그림**. 원본 그대로 · 마지막 장 사진 칸은 기획이 원고 단계부터 사진
 * 경로를 넣어 둔다(`lib/sns/actual-flow.ts:101-105`) — 그것은 만든 그림이 아니다(독립 리뷰).
 */
export function hasOwnImage(card: { kind?: string; assetPath?: string; assetUrl?: string }): boolean {
  return (card.kind ?? "generated") === "generated" && Boolean(card.assetPath || card.assetUrl);
}

/**
 * **만든 작업**(설계 §3). 만든 뒤 상태(완료 · 확인 필요 · 실패)인 장이 있거나, AI 가 그린
 * 장에 그림이 있으면 만든 작업이다. 붙인 사진 칸은 세지 않는다(`hasOwnImage`).
 *
 * 상태(`status`)로 가르지 않는다. 한 장 글을 저장하면 카드뉴스 라우트가 상태를
 * `copy_ready` 로 되돌려(`cards/[index]/route.ts:58`), 상태로 가르면 「이대로 만들기」가
 * 다시 나오고 누르면 전 장 값이 나간다(설계 §2 위험).
 */
export function isMade(project: {
  data: { flow?: { cards: ReadonlyArray<{ status: string; kind?: string; assetPath?: string; assetUrl?: string }> } };
}): boolean {
  return (project.data.flow?.cards ?? []).some((card) => 그림있는상태.has(card.status) || hasOwnImage(card));
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
    "- 칸을 **지우라는** 말이면 그 칸에 「-」 한 글자만 적습니다. headline 은 지울 수 없습니다.",
    "- 지금 글에 없는 사실 · 숫자 · 기관 이름을 새로 넣지 않습니다.",
    `- ${언어}로 씁니다.`,
  ].join("\n");
}

const 칸상한 = { headline: 80, body: 400, accent: 120, footnote: 160 } as const;

/**
 * 고친 글을 다듬는다. 바꿀 것이 없으면 `undefined`.
 *
 * - 말로 고친 글(글 모델): 빈 칸은 안 바꾼 것, 「-」 는 그 칸을 지운다는 뜻
 * - 칸으로 고친 글(`explicit`): 온 칸만 바꾸고, 비운 칸은 지운다
 * - 제목은 어느 쪽이든 지울 수 없다(미뤄 둔 것 4 — 전에는 칸을 비워도 안 지워졌다)
 */
export function readCardEdit(raw: unknown, options: { explicit?: boolean } = {}): CopyPatch | undefined {
  const value = (raw ?? {}) as Record<string, unknown>;
  const patch = Object.fromEntries(
    (Object.keys(칸상한) as Array<keyof typeof 칸상한>).flatMap((key) => {
      if (typeof value[key] !== "string") return [];
      const text = (value[key] as string).trim();
      const 지운다 = options.explicit ? text === "" : text === "-";
      if (지운다) return key === "headline" ? [] : [[key, ""]];
      return text ? [[key, text.slice(0, 칸상한[key])]] : [];
    }),
  ) as CopyPatch;
  return Object.keys(patch).length ? patch : undefined;
}

/** 글 칸에서 **바뀐 칸만** 뽑는다. 비운 칸은 지우기(빈 글), 제목을 비우면 안 바꾼다. */
export function changedCopy(before: CopyPatch, after: CopyPatch): CopyPatch {
  return Object.fromEntries(
    (Object.keys(칸상한) as Array<keyof typeof 칸상한>).flatMap((key) => {
      const 새것 = (after[key] ?? "").trim();
      if (새것 === (before[key] ?? "").trim()) return [];
      if (key === "headline" && !새것) return [];
      return [[key, 새것]];
    }),
  ) as CopyPatch;
}

/** 전부 받기: 그림이 있는 장만. 파일 이름은 저장 경로의 확장자를 쓴다(미뤄 둔 것 3). */
export function downloadList(
  view: { cards: ReadonlyArray<{ index: number; url?: string; path?: string }> },
): Array<{ index: number; url: string; path?: string }> {
  return view.cards.flatMap((card) => (card.url ? [{ index: card.index, url: card.url, ...(card.path ? { path: card.path } : {}) }] : []));
}

/** 게시글을 복사할 한 덩이로. */
export function captionText(caption: Caption): string {
  const 태그 = caption.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ");
  return [caption.hook, caption.body, 태그, caption.firstComment ? `첫 댓글: ${caption.firstComment}` : ""]
    .filter(Boolean).join("\n\n");
}
