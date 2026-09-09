import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { MAX_INPUT_PIXELS } from "../../../lib/image-encoding";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { isLocalStoreEnabled } from "../../../lib/local-store";
import {
  mimeForStoragePath,
  showcaseAssetPath,
  showcasePatchRow,
  toShowcaseAdminView,
  toShowcaseView,
  type ShowcaseAdminView,
  type ShowcaseCreateInput,
  type ShowcasePatchInput,
  type ShowcaseRow,
  type ShowcaseSourceKind,
  type ShowcaseView,
} from "./core";

/**
 * 첫 화면 갤러리 — 저장소를 만지는 쪽.
 *
 * 전부 admin 클라이언트로 한다. 공개 목록은 로그인 없이 읽혀야 하고,
 * 복사본이 놓인 `showcase/` 는 어떤 회원의 Storage 정책에도 걸리지 않기
 * 때문이다. 그래서 **무엇을 내보낼지는 오직 여기 질의 조건이 정한다** —
 * `visible = true` 를 빠뜨리면 꺼 놓은 것이 그대로 공개된다.
 */

const BUCKET = "library";

const ROW_SELECT =
  "id,source_kind,source_id,source_index,owner_id,storage_path,thumb_path,mime_type,width,height,caption,kind_label,position,visible,created_at";

/**
 * 첫 화면에 걸 것.
 *
 * **절대 던지지 않는다.** 랜딩페이지는 로그인 없이 열리는 첫인상이라,
 * 갤러리 한 줄 때문에 첫 화면이 통째로 500 이 되면 안 된다. 못 읽으면
 * 빈 목록을 주고, 화면은 원래 쓰던 그림으로 돌아간다.
 */
export async function listPublicShowcase(): Promise<ShowcaseView[]> {
  if (isLocalStoreEnabled()) return [];
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("showcase_items")
      .select(ROW_SELECT)
      .eq("visible", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(24);
    if (error || !data) return [];
    return (data as ShowcaseRow[]).map(toShowcaseView);
  } catch {
    return [];
  }
}

/** 관리자 목록. 꺼 놓은 것까지 보여야 다시 켤 수 있다. */
export async function listShowcaseForAdmin(): Promise<ShowcaseAdminView[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("showcase_items")
    .select(ROW_SELECT)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ShowcaseRow[]).map(toShowcaseAdminView);
}

/**
 * 공개할 그림 한 장을 내려 준다.
 *
 * **여기서도 `visible` 을 본다.** 목록에서만 걸러 두면, 한 번 공개했다가 끈
 * 그림의 주소를 아는 사람은 계속 볼 수 있다. 끈다는 것은 그 주소가 막힌다는
 * 뜻이어야 한다.
 */
export async function readShowcaseImage(
  id: string,
  size: "full" | "thumb" = "full",
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (isLocalStoreEnabled()) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("showcase_items")
      .select("storage_path,thumb_path,mime_type")
      .eq("id", id)
      .eq("visible", true)
      .maybeSingle();
    if (!data) return null;

    // **사본이 없으면 원본으로 떨어진다.** 이미 걸려 있는 그림에는 사본이
    // 없으므로, 이 갈래가 신·구를 함께 살린다.
    const thumbPath = size === "thumb" ? (data.thumb_path as string | null) : null;
    const path = thumbPath ?? (data.storage_path as string);

    let file = await supabase.storage.from(BUCKET).download(path);
    let servedThumb = Boolean(thumbPath);

    // **사본 파일이 사라졌으면 원본으로 한 번 더 간다.** 표에는 자리가 적혀
    // 있는데 파일만 없어질 수 있다. 그때 404 를 내면 원본이 멀쩡한데도 첫
    // 화면의 그림이 빈다 — 이 목록은 로그인 없이 열리는 첫인상이다.
    if ((file.error || !file.data) && servedThumb) {
      file = await supabase.storage.from(BUCKET).download(data.storage_path as string);
      servedThumb = false;
    }
    if (file.error || !file.data) return null;

    return {
      bytes: Buffer.from(await file.data.arrayBuffer()),
      mimeType: servedThumb ? "image/webp" : (data.mime_type as string) || "image/png",
    };
  } catch {
    return null;
  }
}

const SHOWCASE_THUMBNAIL_WIDTH = 1024;

/**
 * 표시용 사본을 만들어 올린다. 자리를 돌려주고, 못 만들면 `null` 이다.
 *
 * 라이브러리와 같은 규칙을 쓴다 — **작아질 때만 둔다.** 이미 작은 그림은
 * 줄여도 커지는데, 그때는 사본이 자리만 차지한다.
 */
async function uploadShowcaseThumbnail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  id: string,
  bytes: Buffer,
): Promise<string | null> {
  try {
    const thumbnail = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .keepMetadata()
      // **가로만 묶는다.** 갤러리는 열로 흘려 배치하므로 제약은 가로뿐이다.
      // 긴 변을 묶으면 세로로 긴 그림의 가로가 576px 까지 깎이는데, 열 최대
      // 폭(364.5px)을 고해상도 화면에서 채우려면 729px 이 필요하다 — 모자라면
      // 브라우저가 늘려 그려 흐려진다. 이 제품의 결과물은 포스터·카드뉴스라
      // 세로가 기본값이다.
      .resize(SHOWCASE_THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    if (thumbnail.length >= bytes.length) return null;

    const path = `showcase/${id}.thumb.webp`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, thumbnail, { contentType: "image/webp", upsert: true });
    if (error) {
      console.error(`[showcase] 표시용 사본을 올리지 못했습니다: ${error.message}`);
      return null;
    }
    return path;
  } catch (error) {
    console.error(`[showcase] 표시용 사본을 만들지 못했습니다: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

interface SourceImage {
  storagePath: string;
  ownerId: string | null;
  index: number;
}

/**
 * 원본 작업에서 걸 그림 한 장을 찾는다.
 *
 * 관리자가 저장 경로를 직접 보내지 않게 한다. 경로를 받으면 그 값으로
 * 버킷 어디든 가리킬 수 있어, 공개할 생각이 없던 파일을 공개 주소에
 * 올려 버릴 수 있다.
 */
async function findSourceImage(
  kind: ShowcaseSourceKind,
  sourceId: string,
  imageIndex: number | undefined,
): Promise<SourceImage | null> {
  const supabase = createSupabaseAdminClient();

  if (kind === "library") {
    let query = supabase
      .from("library_images")
      .select("user_id,position,path")
      .eq("item_id", sourceId)
      .order("position", { ascending: true })
      .limit(1);
    if (imageIndex !== undefined) query = query.eq("position", imageIndex);
    const { data } = await query;
    const row = data?.[0];
    return row
      ? { storagePath: row.path as string, ownerId: row.user_id as string, index: Number(row.position) }
      : null;
  }

  if (kind === "sns") {
    // 만들지 못한 카드는 asset_path 가 비어 있다. 그런 줄을 고르면 복사할
    // 파일이 없어 실패하므로 애초에 거른다.
    let query = supabase
      .from("sns_cards")
      .select("user_id,index,asset_path")
      .eq("project_id", sourceId)
      .not("asset_path", "is", null)
      .order("index", { ascending: true })
      .limit(1);
    if (imageIndex !== undefined) query = query.eq("index", imageIndex);
    const { data } = await query;
    const row = data?.[0];
    return row
      ? { storagePath: row.asset_path as string, ownerId: row.user_id as string, index: Number(row.index) }
      : null;
  }

  // 포스터는 회원이 고른 변형이 곧 대표다. 안 골랐으면 첫 장을 쓴다.
  let query = supabase
    .from("poster_images")
    .select("user_id,variant_index,asset_path,selected")
    .eq("project_id", sourceId)
    .order("selected", { ascending: false })
    .order("variant_index", { ascending: true })
    .limit(1);
  if (imageIndex !== undefined) query = query.eq("variant_index", imageIndex);
  const { data } = await query;
  const row = data?.[0];
  return row
    ? {
        storagePath: row.asset_path as string,
        ownerId: row.user_id as string,
        index: Number(row.variant_index),
      }
    : null;
}

/**
 * 갤러리에 건다.
 *
 * 원본을 가리키기만 하지 않고 **복사본을 뜬다.** 회원이 자기 작업을 지우면
 * 파일도 함께 사라지는데, 첫 화면이 그 파일을 보고 있으면 그대로 깨진다.
 * 복사해 두면 각 도구의 삭제 코드를 하나도 건드리지 않고도 안 깨진다.
 */
export async function addShowcaseItem(
  input: ShowcaseCreateInput,
  adminId: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = createSupabaseAdminClient();

  const source = await findSourceImage(input.sourceKind, input.sourceId, input.imageIndex);
  if (!source) return { ok: false, message: "걸 그림을 찾지 못했습니다." };

  const original = await supabase.storage.from(BUCKET).download(source.storagePath);
  if (original.error || !original.data) {
    return { ok: false, message: "원본 그림을 읽지 못했습니다." };
  }
  const bytes = Buffer.from(await original.data.arrayBuffer());

  // 첫 화면은 열을 흘려 배치한다. 원래 비율을 모르면 그림이 뜨는 순간
  // 열이 무너지므로 크기를 미리 재 둔다.
  let width: number | null = null;
  let height: number | null = null;
  try {
    const meta = await sharp(bytes).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    // 크기를 못 재도 거는 것 자체는 막지 않는다.
  }

  const id = randomUUID();
  const mimeType = mimeForStoragePath(source.storagePath);
  const storagePath = showcaseAssetPath(id, mimeType);

  const uploaded = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
  if (uploaded.error) return { ok: false, message: uploaded.error.message };

  /**
   * 화면에 걸 사본.
   *
   * 갤러리는 `next/image` 를 쓰므로 브라우저로 나가는 양은 이미 줄어 있다.
   * 그래도 만드는 이유는 둘이다 — next/image 는 줄이기 전에 **원본을 통째로**
   * 받아 오고(배포마다 그 캐시가 빈다), 크기를 못 잰 그림은 next/image 를
   * 못 써서 원본이 그대로 브라우저까지 간다.
   *
   * 라이브러리 목록(512px)보다 크게 잡는다. 갤러리는 제품의 첫인상이고 화면에
   * 24vw 로 뜨므로 4K 에서 920px 까지 커진다 — 512 로 줄이면 흐릿해진다.
   *
   * **못 만들어도 거는 것 자체는 막지 않는다.** 없으면 원본으로 떨어진다.
   */
  const thumbPath = await uploadShowcaseThumbnail(supabase, id, bytes);

  const { error } = await supabase.from("showcase_items").insert({
    id,
    source_kind: input.sourceKind,
    source_id: input.sourceId,
    source_index: source.index,
    owner_id: source.ownerId,
    storage_path: storagePath,
    thumb_path: thumbPath,
    mime_type: mimeType,
    width,
    height,
    caption: input.caption ?? null,
    kind_label: input.kindLabel ?? null,
    position: input.position ?? 0,
    created_by: adminId,
  });

  if (error) {
    // 행이 없으면 아무도 못 찾는 파일이다. 용량만 차지하므로 되돌린다.
    // **사본도 함께 지운다.** id 는 매번 새로 만들므로, 행이 안 생기면 이
    // 사본을 가리킬 행이 영영 없다 — 삭제 때도 안 지워진다.
    await supabase.storage
      .from(BUCKET)
      .remove([storagePath, thumbPath].filter(Boolean) as string[]);
    const duplicate = error.code === "23505";
    return {
      ok: false,
      message: duplicate ? "이미 갤러리에 걸린 그림입니다." : error.message,
    };
  }

  return { ok: true, id };
}

/**
 * 차례를 한 칸 옮긴다.
 *
 * 두 줄의 `position` 을 맞바꾸지 않고 **보이는 차례대로 전부 다시 매긴다.**
 * 처음 건 것들은 차례가 모두 0 이라, 맞바꾸기만 하면 0 과 0 을 바꿔 아무 일도
 * 일어나지 않는다. 관리자는 버튼을 눌렀는데 화면이 그대로인 것을 고장으로
 * 본다.
 *
 * 목록은 화면이 보낸 것이 아니라 여기서 다시 읽는다. 화면이 보낸 차례를
 * 믿으면, 두 관리자가 동시에 만질 때 한쪽이 남의 순서를 통째로 덮어쓴다.
 */
export async function reorderShowcaseItem(id: string, direction: "up" | "down") {
  const items = await listShowcaseForAdmin();
  const at = items.findIndex((item) => item.id === id);
  if (at < 0) return { ok: false as const, message: "갤러리 항목을 찾지 못했습니다." };

  const to = direction === "up" ? at - 1 : at + 1;
  // 끝에 닿았으면 할 일이 없다. 오류가 아니다.
  if (to < 0 || to >= items.length) return { ok: true as const };

  const ordered = items.map((item, index) =>
    index === at ? items[to] : index === to ? items[at] : item,
  );

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  for (const [position, item] of ordered.entries()) {
    if (item.position === position) continue;
    const { error } = await supabase
      .from("showcase_items")
      .update({ position, updated_at: now })
      .eq("id", item.id);
    if (error) return { ok: false as const, message: error.message };
  }
  return { ok: true as const };
}

export async function patchShowcaseItem(input: ShowcasePatchInput) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("showcase_items")
    .update(showcasePatchRow(input, new Date().toISOString()))
    .eq("id", input.id);
  return error ? { ok: false as const, message: error.message } : { ok: true as const };
}

/**
 * 갤러리에서 내리고 복사본까지 지운다.
 *
 * 파일을 먼저 지우면 행만 남아 깨진 그림이 걸린다. 행을 먼저 지운다 —
 * 파일만 남는 것은 눈에 안 띄고 용량만 차지할 뿐이다.
 */
export async function removeShowcaseItem(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("showcase_items")
    .select("storage_path,thumb_path")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ok: false as const, message: "갤러리 항목을 찾지 못했습니다." };

  const { error } = await supabase.from("showcase_items").delete().eq("id", id);
  if (error) return { ok: false as const, message: error.message };

  // **사본도 함께 지운다.** 행이 사라지면 사본의 자리를 아는 곳이 없어진다.
  const paths = [data.storage_path as string, data.thumb_path as string | null].filter(Boolean) as string[];
  await supabase.storage.from(BUCKET).remove(paths);
  return { ok: true as const };
}
