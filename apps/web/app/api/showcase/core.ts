import { z } from "zod";

/**
 * 첫 화면 갤러리에 걸 결과물 — 값을 다루는 규칙만 모은 곳.
 *
 * DB 도 Storage 도 여기서는 만지지 않는다. 무엇을 내보내고 무엇을 감추는지가
 * 이 기능에서 가장 위험한 판단이라, 그 판단만 따로 떼어 시험할 수 있게 둔다.
 */

export type ShowcaseSourceKind = "library" | "sns" | "poster";

export const ShowcaseSourceKindSchema = z.enum(["library", "sns", "poster"]);

export const ShowcaseCreateSchema = z.object({
  sourceKind: ShowcaseSourceKindSchema,
  sourceId: z.string().uuid(),
  /** 여러 장짜리 작업에서 몇 번째를 걸지. 없으면 대표 한 장을 고른다. */
  imageIndex: z.number().int().min(0).max(50).optional(),
  caption: z.string().max(200).optional(),
  kindLabel: z.string().max(60).optional(),
  position: z.number().int().min(0).max(999).optional(),
});

export const ShowcasePatchSchema = z.object({
  id: z.string().uuid(),
  visible: z.boolean().optional(),
  caption: z.string().max(200).nullable().optional(),
  kindLabel: z.string().max(60).nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
});

export const ShowcaseDeleteSchema = z.object({ id: z.string().uuid() });

export type ShowcaseCreateInput = z.infer<typeof ShowcaseCreateSchema>;
export type ShowcasePatchInput = z.infer<typeof ShowcasePatchSchema>;

/** DB 에서 읽은 그대로의 한 줄. */
export interface ShowcaseRow {
  id: string;
  source_kind: ShowcaseSourceKind;
  source_id: string;
  source_index: number;
  owner_id: string | null;
  storage_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  kind_label: string | null;
  position: number;
  visible: boolean;
  created_at: string;
}

/**
 * 로그인 없이 나가는 모양.
 *
 * **소유자·원본 id·저장 경로는 담지 않는다.** 이 응답은 검색엔진과 지나가는
 * 누구나 읽는다. 누가 만들었는지가 새 나가면, 출시 전 기획물을 만든 회사가
 * 무엇을 준비 중인지까지 함께 새 나간다.
 */
export interface ShowcaseView {
  id: string;
  url: string;
  /** 화면에 거는 작은 사본. 없으면 `url` 로 떨어진다. */
  thumbUrl: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  kindLabel: string | null;
}

/** 화면은 저장 경로를 모른다. 이 주소로만 읽는다. */
export function showcaseImageUrl(id: string): string {
  return `/api/showcase/${id}/file`;
}

/**
 * 화면에 걸 사본의 주소.
 *
 * 없으면 라우트가 원본으로 떨어뜨리므로 화면은 있는지 없는지 몰라도 된다.
 */
export function showcaseThumbUrl(id: string): string {
  return `/api/showcase/${id}/file?size=thumb`;
}

export function toShowcaseView(row: ShowcaseRow): ShowcaseView {
  return {
    id: row.id,
    url: showcaseImageUrl(row.id),
    thumbUrl: showcaseThumbUrl(row.id),
    width: row.width,
    height: row.height,
    caption: row.caption,
    kindLabel: row.kind_label,
  };
}

/** 관리자 화면이 볼 모양. 어디서 온 것인지와 꺼져 있는지를 함께 준다. */
export interface ShowcaseAdminView extends ShowcaseView {
  sourceKind: ShowcaseSourceKind;
  sourceId: string;
  /**
   * 원본에서 몇 번째 장인가.
   *
   * 카드뉴스는 한 작업에 여러 장이 들어 있다. 이 값이 없으면 라이브러리에서
   * "이 작업의 무언가가 걸렸다"까지만 알 뿐, 지금 보고 있는 장이 그 장인지를
   * 가릴 수 없어 같은 그림을 또 걸려다 중복 오류를 만난다.
   */
  sourceIndex: number;
  position: number;
  visible: boolean;
  createdAt: string;
}

export function toShowcaseAdminView(row: ShowcaseRow): ShowcaseAdminView {
  return {
    ...toShowcaseView(row),
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    sourceIndex: row.source_index,
    position: row.position,
    visible: row.visible,
    createdAt: row.created_at,
  };
}

/**
 * 이 그림이 이미 갤러리에 걸려 있는가.
 *
 * DB 의 중복 방지 열쇠(`source_kind, source_id, source_index`)와 **같은 세
 * 값으로** 본다. 화면이 다른 기준으로 판단하면, 화면에는 "안 걸림"이라 떠
 * 있는데 누르는 순간 중복 오류가 나는 어긋남이 생긴다.
 *
 * 꺼 놓은 것도 걸린 것으로 본다. 꺼져 있어도 행은 남아 있어 다시 걸 수 없고,
 * 관리자가 할 일은 새로 거는 것이 아니라 켜는 것이다.
 */
export function isShowcased(
  items: readonly ShowcaseAdminView[],
  sourceKind: ShowcaseSourceKind,
  sourceId: string,
  sourceIndex: number,
): boolean {
  return items.some(
    (item) =>
      item.sourceKind === sourceKind &&
      item.sourceId === sourceId &&
      item.sourceIndex === sourceIndex,
  );
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function mimeForStoragePath(storagePath: string): string {
  const extension = storagePath.slice(storagePath.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "image/png";
}

/**
 * 복사본이 놓일 자리.
 *
 * 소유자 폴더가 아니라 `showcase/` 아래에 둔다. library 버킷의 Storage 정책은
 * 첫 칸을 소유자로 보므로, 이 경로는 **어떤 회원도 직접 열 수 없다.** 공개인데
 * 아무도 직접 못 여는 것이 맞다 — 나가는 길을 우리 라우트 하나로 좁혀야
 * 꺼 놓은 것이 새 나가지 않는다.
 */
export function showcaseAssetPath(id: string, mimeType: string): string {
  return `showcase/${id}.${EXTENSIONS[mimeType] ?? "png"}`;
}

/**
 * 보낸 값만 고친다.
 *
 * `undefined` 를 그대로 넘기면 supabase-js 가 null 로 덮어쓴다 — 차례만
 * 바꾸려다 설명이 사라진다. 반대로 null 은 "지워 달라"는 뜻이라 살린다.
 */
export function showcasePatchRow(
  input: ShowcasePatchInput,
  now: string,
): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: now };
  if (input.visible !== undefined) row.visible = input.visible;
  if (input.caption !== undefined) row.caption = input.caption;
  if (input.kindLabel !== undefined) row.kind_label = input.kindLabel;
  if (input.position !== undefined) row.position = input.position;
  return row;
}
