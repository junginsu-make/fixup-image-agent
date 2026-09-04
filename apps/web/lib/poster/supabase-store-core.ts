import type {
  PosterGenerationRequestRecord,
  PosterImageRecord,
  PosterProjectRecord,
} from "@fixup/poster-core";

/**
 * 포스터 저장소의 **표 ↔ 기록 변환**.
 *
 * 질의는 옆 파일(`supabase-store.ts`)이 한다. 여기에는 DB 가 필요 없는 부분만
 * 둔다 — 이름을 바꾸고, 소유자를 묶고, 경로를 만드는 일. 버그가 사는 곳이
 * 거기라서 그렇다.
 *
 * 카드뉴스의 `sns-generation-store-core.ts` 와 같은 방식이다.
 */

/** 결과 이미지도 라이브러리와 같은 버킷을 쓴다. 정책이 경로 첫 칸으로 소유자를 판정한다. */
export function posterAssetPath(userId: string, projectId: string, variantIndex: number): string {
  return `${userId}/poster/${projectId}/${variantIndex}.png`;
}

/** 화면은 저장 경로를 모른다. 로컬이든 운영이든 이 주소로 읽는다. */
export function posterImageUrl(projectId: string, variantIndex: number): string {
  return `/api/poster/projects/${projectId}/images/${variantIndex}/file`;
}

/**
 * 목록에 거는 사본의 주소.
 *
 * 사본이 없으면 라우트가 원본으로 떨어뜨리므로, 화면은 있는지 없는지 몰라도 된다.
 */
export function posterThumbUrl(projectId: string, variantIndex: number): string {
  return `${posterImageUrl(projectId, variantIndex)}?size=thumb`;
}

/**
 * 사본이 놓일 자리.
 *
 * **원본 이름 규칙은 건드리지 않는다.** 사본은 별개 파일이라 `.thumb.webp` 를
 * 덧붙이기만 하면 되고, 그래야 이미 쌓인 `.png` 들이 그대로 열린다.
 */
export function posterThumbPath(userId: string, projectId: string, variantIndex: number): string {
  return `${userId}/poster/${projectId}/${variantIndex}.thumb.webp`;
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface PosterProjectRow {
  id: string;
  user_id: string;
  title: string;
  status: string;
  ratio: string;
  model_id: string;
  data: PosterProjectRecord["data"];
  created_at: string;
  updated_at: string;
}

export function toProjectRecord(row: PosterProjectRow): PosterProjectRecord {
  return {
    id: row.id,
    title: row.title,
    status: row.status as PosterProjectRecord["status"],
    ratio: row.ratio,
    modelId: row.model_id,
    data: row.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 소유자는 **세션에서만** 온다.
 *
 * 입력에 `user_id` 나 `userId` 가 섞여 와도 자리가 없다. 그리고 `status` 는
 * 보내지 않는다 — 마이그레이션이 회원에게 그 칸의 INSERT 권한을 주지 않았고
 * 기본값이 `draft` 다.
 */
export function projectInsertRow(
  userId: string,
  input: Omit<PosterProjectRecord, "id" | "createdAt" | "updatedAt">,
) {
  return {
    user_id: userId,
    title: input.title,
    ratio: input.ratio,
    model_id: input.modelId,
    data: input.data,
  };
}

/** 안 보낸 칸은 넣지 않는다. `undefined` 를 실으면 supabase-js 가 null 로 덮는다. */
export function projectPatchRow(
  patch: Partial<Pick<PosterProjectRecord, "title" | "status" | "ratio" | "modelId" | "data">>,
  now: string,
) {
  return {
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.ratio === undefined ? {} : { ratio: patch.ratio }),
    ...(patch.modelId === undefined ? {} : { model_id: patch.modelId }),
    ...(patch.data === undefined ? {} : { data: patch.data }),
    updated_at: now,
  };
}

export function requestInsertRow(
  userId: string,
  row: Omit<PosterGenerationRequestRecord, "id" | "createdAt" | "returnedImages" | "costUsd" | "falRequestId">,
) {
  return {
    user_id: userId,
    project_id: row.projectId,
    parent_image_id: row.parentImageId,
    edit_instruction: row.editInstruction,
    model_id: row.modelId,
    ratio_id: row.ratioId,
    mode: row.mode,
    size: row.size,
    requested_images: row.requestedImages,
    unit_cost_usd: row.unitCostUsd,
    cost_approximate: row.costApproximate,
  };
}

export interface PosterImageRow {
  id: string;
  user_id: string;
  project_id: string;
  generation_request_id: string;
  variant_index: number;
  selected: boolean;
  asset_path: string;
  thumb_path?: string | null;
  width: number | null;
  height: number | null;
  review: unknown | null;
  created_at: string;
}

export function toImageRecord(row: PosterImageRow): PosterImageRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    generationRequestId: row.generation_request_id,
    variantIndex: row.variant_index,
    selected: row.selected,
    assetPath: row.asset_path,
    thumbPath: row.thumb_path ?? null,
    width: numeric(row.width),
    height: numeric(row.height),
    review: row.review ?? null,
    createdAt: row.created_at,
    url: posterImageUrl(row.project_id, row.variant_index),
    thumbUrl: posterThumbUrl(row.project_id, row.variant_index),
  };
}

export function imageInsertRows(
  userId: string,
  rows: Array<Omit<PosterImageRecord, "id" | "createdAt" | "selected">>,
) {
  return rows.map((row) => ({
    user_id: userId,
    project_id: row.projectId,
    generation_request_id: row.generationRequestId,
    variant_index: row.variantIndex,
    thumb_path: row.thumbPath ?? null,
    asset_path: row.assetPath,
    width: row.width,
    height: row.height,
    review: row.review ?? null,
  }));
}
