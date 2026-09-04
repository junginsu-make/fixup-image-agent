import { createSupabaseAdminClient } from "./supabase/admin";
import { isLocalStoreEnabled } from "./local-store";
import { markAsAi } from "./watermark";
import type { UserRole } from "./membership/types";

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
 *
 * **여기서 읽고 쓰는 것은 전부 admin 클라이언트다.** 그러므로 RLS 는 이 길에
 * 관여하지 않고, 남의 것을 못 보게 막는 실제 방어선은 아래 질의 조건이다.
 * 조건 하나를 빠뜨리면 그 순간 전부 새 나간다 — 그래서 조건을 만드는 곳을
 * `libraryScope` 한 군데로 모았다.
 */

const BUCKET = "library";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** 목록을 보는 사람. 클라이언트가 보낸 값이 아니라 세션에서 꺼낸 것만 넣는다. */
export interface LibraryViewer {
  userId: string;
  role: UserRole;
}

/**
 * 이 사람의 질의에 걸 소유자 조건. `null` 이면 조건을 걸지 않는다.
 *
 * **관리자는 보기도 지우기도 전체가 열린다.**
 *
 * 한동안 지우기는 관리자라도 자기 것만 두었다. 남이 크레딧을 써서 만든 결과를
 * 되돌릴 수 없게 없애는 일이라 무겁다고 보았기 때문이다. 운영자의 판단은
 * 달랐다 — 이 서비스의 최고 관리자는 회원이 올린 것을 내려야 할 사람이고,
 * 지울 수 없으면 잘못 올라온 것을 치울 방법이 없다.
 *
 * 무거운 일이라는 사실은 그대로다. 그래서 화면은 지우기 전에 한 번 더 묻고,
 * 무엇을 지우는지와 누가 만든 것인지를 함께 보여준다.
 */
export function libraryScope(viewer: LibraryViewer, action: "read" | "delete"): string | null {
  if (viewer.role === "admin") return null;
  return viewer.userId;
}

export interface LibraryImageInput {
  base64: string;
  mimeType: string;
}

export type LibrarySourceType = "generation" | "character";

/**
 * 이 그림을 AI 가 만들었는가.
 *
 * `/api/library` 로는 두 가지가 들어온다 — 도구가 만든 결과와, 사용자가
 * 라이브러리 화면에서 직접 고른 파일이다. 표기는 **AI 가 만든 것에만**
 * 붙어야 한다. 사용자가 찍은 사진에 "AI 이미지" 를 새겨 돌려주면 그것은
 * 사실이 아닌 표기다.
 */
export type LibraryOrigin = "ai" | "upload";

export interface SaveLibraryItemInput {
  userId: string;
  title: string;
  tool: "create" | "redesign";
  /** 기본값을 두지 않는다. 부르는 쪽이 매번 정하게 해야 나중에 빠지지 않는다. */
  origin: LibraryOrigin;
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
  /** 내가 만든 것인가. 관리자 목록에서 남의 것과 구분하는 데 쓴다. */
  mine: boolean;
  /** 누가 만들었는가. **관리자에게만** 채운다 — 회원끼리 이메일이 보이면 안 된다. */
  ownerEmail: string | null;
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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 바이트를 보고 형식을 정한다.
 *
 * 표기를 새기면 sharp 가 무엇을 받았든 PNG 로 다시 굽는다. 그런데 확장자와
 * content-type 은 부르는 쪽이 알려준 원래 값이라, 그대로 쓰면 `.jpg` 라는
 * 이름의 PNG 가 `image/jpeg` 로 저장된다. 브라우저가 못 여는 파일이 된다.
 *
 * 그래서 **올리기 직전 실제 바이트를 보고** 정한다. 표기가 꺼져 있어
 * 원본이 그대로 돌아온 경우도 같은 길로 지나가므로 갈래가 하나다.
 */
export function sniffImageMime(bytes: Buffer, fallback: string): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return fallback;
}

/**
 * 결과물 한 건을 저장한다.
 *
 * 이미지를 먼저 올리고 메타데이터를 쓴다. 중간에 실패하면 올라간 파일을 지운다 —
 * 목록에 없는데 용량만 차지하는 파일이 남는 것이 가장 나쁘다.
 *
 * AI 가 만든 것이면 올리기 직전에 "AI 이미지" 를 새긴다. 상세페이지와
 * 리디자인은 그림을 만든 자리가 서로 다르지만 저장은 여기 하나로 모이므로,
 * 여기 한 번 걸어 두면 두 도구가 함께 덮인다. 표기가 실패해도 원본이
 * 돌아오므로 그림을 잃지는 않는다.
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
      const original = Buffer.from(image.base64, "base64");
      const bytes = input.origin === "ai" ? await markAsAi(original) : original;
      const mimeType = sniffImageMime(bytes, image.mimeType);

      const path = `${input.userId}/${item.id}/${position}.${extensionFor(mimeType)}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: mimeType, upsert: true });
      if (error) throw new Error(error.message);

      uploaded.push(path);
      rows.push({
        item_id: item.id,
        user_id: input.userId,
        position,
        path,
        mime_type: mimeType,
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

/**
 * 만든 사람의 이메일을 붙인다. **관리자 목록에서만 부른다.**
 *
 * 조인 대신 두 번 묻는다. PostgREST 임베드는 관계 이름이 바뀌면 조용히
 * 빈 값을 주는데, 여기서 빈 값은 "누가 만들었는지 모르는 목록"이 된다.
 */
async function emailsByUserId(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return new Map();
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("profiles").select("id,email").in("id", unique);
  return new Map(
    ((data ?? []) as Array<{ id: string; email: string | null }>)
      .filter((row) => row.email)
      .map((row) => [row.id, row.email as string]),
  );
}

export async function listLibraryItems(viewer: LibraryViewer): Promise<ServerLibraryItem[]> {
  // 로컬 확인 모드에는 이 보관함이 없다. 500 을 내면 서버가 고장난 것처럼
  // 보이지만 사실은 안 쓰는 저장소다. 비어 있다고 답하는 것이 정직하다.
  if (isLocalStoreEnabled()) return [];
  const supabase = createSupabaseAdminClient();

  const owner = libraryScope(viewer, "read");
  let query = supabase
    .from("library_items")
    .select("id,user_id,title,tool,aspect_ratio,source_type,source_id,image_count,cover_path,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (owner) query = query.eq("user_id", owner);

  const { data, error } = await query;
  if (error || !data) return [];

  const covers = data.map((row: { cover_path: string | null }) => row.cover_path).filter(Boolean) as string[];
  const signed = covers.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(covers, SIGNED_URL_TTL_SECONDS)
    : { data: [] };

  const urlByPath = toUrlMap(signed.data);
  // 관리자만 남의 것을 본다. 회원 목록은 전부 자기 것이라 이메일을 붙일
  // 이유가 없고, 붙이면 회원끼리 이메일이 보이는 길이 하나 생긴다.
  const emails = owner
    ? new Map<string, string>()
    : await emailsByUserId(data.map((row: { user_id: string }) => row.user_id));

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
    mine: row.user_id === viewer.userId,
    ownerEmail: emails.get(row.user_id as string) ?? null,
  }));
}

/** 한 건의 이미지 전체. 서명 URL 이라 수명이 있다. */
export async function getLibraryItemImages(viewer: LibraryViewer, itemId: string) {
  const supabase = createSupabaseAdminClient();

  const owner = libraryScope(viewer, "read");
  let query = supabase
    .from("library_images")
    .select("position,path,mime_type")
    .eq("item_id", itemId)
    .order("position", { ascending: true });
  if (owner) query = query.eq("user_id", owner);

  const { data, error } = await query;
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
 *
 * 관리자여도 자기 것만 지운다 — `libraryScope` 가 delete 에는 언제나
 * 소유자 조건을 준다.
 */
export async function deleteLibraryItem(viewer: LibraryViewer, itemId: string) {
  const supabase = createSupabaseAdminClient();
  const owner = libraryScope(viewer, "delete");

  /**
   * 조건이 없으면 **아예 걸지 않는다.**
   *
   * `null` 을 그대로 `eq` 에 넘기면 「소유자가 비어 있는 줄」을 찾는 질의가
   * 된다. 한 줄도 안 지우면서 오류도 안 나므로, 화면에는 「지웠다」가 뜨고
   * 실제로는 그대로 남는다. 관리자에게 조건이 사라진 지금 이 함정이 열렸다.
   */
  const imageQuery = supabase.from("library_images").select("path").eq("item_id", itemId);
  const { data: images } = await (owner ? imageQuery.eq("user_id", owner) : imageQuery);

  const paths = (images ?? []).map((row: { path: string }) => row.path as string).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

  const deleteQuery = supabase.from("library_items").delete().eq("id", itemId);
  const { error } = await (owner ? deleteQuery.eq("user_id", owner) : deleteQuery);

  return { ok: !error, message: error?.message };
}
