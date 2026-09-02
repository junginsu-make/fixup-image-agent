import { createSupabaseAdminClient } from "./supabase/admin";
import { isLocalStoreEnabled } from "./local-store";

/**
 * 사용자별 서버 라이브러리.
 *
 * 지금까지 결과물은 브라우저 IndexedDB 에만 있었다. 다른 기기에서 안 보이고,
 * 한 PC 를 두 사람이 쓰면 서로의 작업물이 보이고, 브라우저 데이터를 지우면
 * 전부 사라졌다. 크레딧을 써서 만든 결과가 브라우저 청소 한 번에 없어졌다.
 *
 * 이미지는 Storage 버킷 'library' 에, 메타데이터만 테이블에 둔다. 섹션 이미지
 * 한 장이 2~5MB라 base64 로 행에 넣으면 목록 조회조차 느려진다.
 *
 * 경로는 `{user_id}/{item_id}/{position}.{ext}` 다. 첫 칸이 소유자라
 * Storage 정책이 경로만 보고 판정한다 — 조인하다 실수할 여지를 없앤다.
 */

const BUCKET = "library";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface LibraryImageInput {
  base64: string;
  mimeType: string;
}

export type LibrarySourceType = "generation" | "character";

export interface SaveLibraryItemInput {
  userId: string;
  title: string;
  tool: "create" | "redesign";
  aspectRatio?: string;
  /** 같은 결과물이 전용 목록에도 있을 때 선택창에서 중복되지 않게 구분한다. */
  sourceType?: LibrarySourceType;
  /** 전용 원본의 id. 원본을 지워도 라이브러리 결과물은 보존하므로 FK로 묶지 않는다. */
  sourceId?: string;
  images: LibraryImageInput[];
}

export interface ServerLibraryItem {
  id: string;
  title: string;
  tool: "create" | "redesign";
  aspectRatio: string | null;
  sourceType: LibrarySourceType;
  sourceId: string | null;
  imageCount: number;
  createdAt: string;
  /** 목록용 표지. 서명 URL 이라 수명이 있다. */
  coverUrl: string | null;
}

/** createSignedUrls 는 항목마다 실패할 수 있다. 실패한 것은 버린다. */
function toUrlMap(entries: Array<{ path: string | null; signedUrl: string | null }> | null) {
  const map = new Map<string, string>();
  for (const entry of entries ?? []) {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  }
  return map;
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

/**
 * 결과물 한 건을 저장한다.
 *
 * 이미지를 먼저 올리고 메타데이터를 쓴다. 중간에 실패하면 올라간 파일을 지운다 —
 * 목록에 없는데 용량만 차지하는 파일이 남는 것이 가장 나쁘다.
 */
export async function saveLibraryItem(input: SaveLibraryItemInput) {
  if (input.images.length === 0) {
    return { ok: false as const, message: "저장할 이미지가 없습니다." };
  }

  const supabase = createSupabaseAdminClient();

  const { data: item, error: itemError } = await supabase
    .from("library_items")
    .insert({
      user_id: input.userId,
      title: input.title.slice(0, 200),
      tool: input.tool,
      aspect_ratio: input.aspectRatio ?? null,
      source_type: input.sourceType ?? "generation",
      source_id: input.sourceId ?? null,
      image_count: input.images.length,
    })
    .select("id")
    .single();

  if (itemError || !item) {
    return { ok: false as const, message: itemError?.message ?? "저장하지 못했습니다." };
  }

  const uploaded: string[] = [];

  try {
    const rows = [];
    for (const [position, image] of input.images.entries()) {
      const path = `${input.userId}/${item.id}/${position}.${extensionFor(image.mimeType)}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, Buffer.from(image.base64, "base64"), {
          contentType: image.mimeType,
          upsert: true,
        });
      if (error) throw new Error(error.message);

      uploaded.push(path);
      rows.push({
        item_id: item.id,
        user_id: input.userId,
        position,
        path,
        mime_type: image.mimeType,
      });
    }

    const { error: imagesError } = await supabase.from("library_images").insert(rows);
    if (imagesError) throw new Error(imagesError.message);

    await supabase.from("library_items").update({ cover_path: uploaded[0] }).eq("id", item.id);

    return { ok: true as const, id: item.id as string, imageCount: rows.length };
  } catch (error) {
    // 되돌린다. 파일부터 지우고 행을 지운다 — 순서가 반대면 경로를 잃는다.
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    await supabase.from("library_items").delete().eq("id", item.id);
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.",
    };
  }
}

export async function listLibraryItems(userId: string): Promise<ServerLibraryItem[]> {
  // 로컬 확인 모드에는 이 보관함이 없다. 500 을 내면 서버가 고장난 것처럼
  // 보이지만 사실은 안 쓰는 저장소다. 비어 있다고 답하는 것이 정직하다.
  if (isLocalStoreEnabled()) return [];
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("library_items")
    .select("id,title,tool,aspect_ratio,source_type,source_id,image_count,cover_path,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  const covers = data.map((row: { cover_path: string | null }) => row.cover_path).filter(Boolean) as string[];
  const signed = covers.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(covers, SIGNED_URL_TTL_SECONDS)
    : { data: [] };

  const urlByPath = toUrlMap(signed.data);

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    tool: row.tool as "create" | "redesign",
    aspectRatio: (row.aspect_ratio as string | null) ?? null,
    sourceType: (row.source_type as LibrarySourceType | null) ?? "generation",
    sourceId: (row.source_id as string | null) ?? null,
    imageCount: Number(row.image_count ?? 0),
    createdAt: String(row.created_at),
    coverUrl: row.cover_path ? urlByPath.get(row.cover_path as string) ?? null : null,
  }));
}

/** 한 건의 이미지 전체. 서명 URL 이라 수명이 있다. */
export async function getLibraryItemImages(userId: string, itemId: string) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("library_images")
    .select("position,path,mime_type")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .order("position", { ascending: true });

  if (error || !data?.length) return [];

  const signed = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(data.map((row: { path: string }) => row.path as string), SIGNED_URL_TTL_SECONDS);

  const urlByPath = toUrlMap(signed.data);

  return data.map((row: Record<string, unknown>) => ({
    position: Number(row.position),
    mimeType: row.mime_type as string,
    url: urlByPath.get(row.path as string) ?? null,
  }));
}

/**
 * 삭제. 파일을 먼저 지운다.
 *
 * on delete cascade 는 행만 지우고 Storage 파일은 남긴다. 지웠다고 생각한
 * 이미지가 서버에 남아 있는 것이 가장 나쁘다.
 */
export async function deleteLibraryItem(userId: string, itemId: string) {
  const supabase = createSupabaseAdminClient();

  const { data: images } = await supabase
    .from("library_images")
    .select("path")
    .eq("user_id", userId)
    .eq("item_id", itemId);

  const paths = (images ?? []).map((row: { path: string }) => row.path as string).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

  const { error } = await supabase
    .from("library_items")
    .delete()
    .eq("user_id", userId)
    .eq("id", itemId);

  return { ok: !error, message: error?.message };
}
