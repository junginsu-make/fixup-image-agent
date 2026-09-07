import { createSupabaseAdminClient } from "./supabase/admin";
import { scopedRead, type ViewScope } from "./teams/scope";
import { isLocalStoreEnabled } from "./local-store";
import { encodeForStorage, makeThumbnail, sniffImageMime } from "./image-encoding";
import { markAsAi } from "./watermark";
import type { UserRole } from "./membership/types";
import { hasFullScope, ownerFilter, type ScopeAction } from "./access/core";

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
  /**
   * 지금 고른 프로젝트. 있으면 그 갈래만 보인다.
   *
   * **없으면 「전체」다.** 안 거는 쪽이 기본이라, 빠뜨렸을 때 화면이 비지 않는다.
   */
  projectId?: string | null;
  /**
   * 이 사람의 팀. 있으면 같은 팀 것이 함께 보인다.
   *
   * 없어도 되게 둔 것은, 팀을 모르는 자리에서 부르면 **개인으로 취급**되어
   * 지금까지와 같게 동작하기 때문이다. 빠뜨렸을 때 남의 것이 보이는 쪽으로
   * 틀리지 않는다.
   */
  teamId?: string | null;
}

/** 읽기 범위. 팀이 있으면 팀 것까지, 없으면 내 것만, 운영자는 전부. */
function readScope(viewer: LibraryViewer): ViewScope {
  return {
    userId: viewer.userId,
    teamId: viewer.teamId ?? null,
    isAdmin: hasFullScope(viewer, "read"),
  };
}

/**
 * 이 사람의 질의에 걸 소유자 조건. 조건이 필요 없으면 `undefined` 다.
 *
 * **판단 자체는 `lib/access/core.ts` 가 한다.** 여기 있던 규칙을 그리로
 * 옮겼다 — 같은 질문("관리자는 남의 것을 볼 수 있나")을 열다섯 군데가 각자
 * 답하다가 어긋난 적이 있다. 이 함수는 이름만 남겨 부르는 쪽을 안 건드린다.
 *
 * 관리자는 보기도 지우기도 전체가 열린다. 무거운 일이라는 사실은 그대로라,
 * 화면은 지우기 전에 한 번 더 묻고 누가 만든 것인지를 함께 보여준다.
 *
 * **`export` 만 다르다 — 전체가 열린 사람도 자기 것만이다.** 판단은
 * `access/core.ts` 가 한다(거기 머리말에 근거를 적었다).
 */
export function libraryScope(viewer: LibraryViewer, action: ScopeAction): string | undefined {
  return ownerFilter(viewer, action);
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
  /** 목록 카드가 쓰는 작은 사본. 없으면 `coverUrl` 로 떨어진다. */
  coverThumbUrl: string | null;
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

/**
 * 바이트를 보고 형식을 정한다. 정의는 `image-encoding` 에 있다.
 *
 * 확장자와 content-type 은 부르는 쪽이 알려준 값이라, 그대로 쓰면 `.jpg` 라는
 * 이름의 PNG 가 `image/jpeg` 로 저장된다. 브라우저가 못 여는 파일이 된다.
 * 그래서 **올리기 직전 실제 바이트를 보고** 정한다.
 *
 * 인코딩과 같은 파일에 둔 것은, 저장할 바이트를 정하는 쪽과 그 바이트가
 * 무엇인지 말하는 쪽이 갈라지면 언젠가 서로 다른 답을 내기 때문이다.
 */
export { sniffImageMime };

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
  let coverThumbPath: string | null = null;

  try {
    const rows = [];
    for (const [position, image] of input.images.entries()) {
      const original = Buffer.from(image.base64, "base64");
      const marked = input.origin === "ai" ? await markAsAi(original) : original;
      // 표기까지 새긴 뒤에 줄인다. 표기가 픽셀을 바꾸므로 순서가 뒤바뀌면
      // 줄여 놓은 것을 다시 부풀린 채로 저장하게 된다.
      const { bytes, mimeType } = await encodeForStorage(marked, image.mimeType);

      const path = `${input.userId}/${item.id}/${position}.${extensionFor(mimeType)}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: mimeType, upsert: true });
      if (error) throw new Error(error.message);

      uploaded.push(path);

      // 목록에 걸 작은 사본. **못 만들어도 저장을 막지 않는다** — 목록이
      // 조금 무거운 것보다 결과물을 잃는 것이 훨씬 나쁘다.
      // **원본보다 작을 때만 둔다.** 이미 작은 그림은 512px 로 줄여도 오히려
      // 커질 수 있다 — 그때는 사본이 자리만 차지하고 목록도 더 느려진다.
      // 저장 인코딩과 같은 규칙이라, 여기서도 용량이 느는 일이 없다.
      const candidate = await makeThumbnail(bytes);
      const thumbnail = candidate && candidate.length < bytes.length ? candidate : null;
      let thumbPath: string | null = null;
      if (thumbnail) {
        thumbPath = `${input.userId}/${item.id}/${position}.thumb.webp`;
        const { error: thumbError } = await supabase.storage
          .from(BUCKET)
          .upload(thumbPath, thumbnail, { contentType: "image/webp", upsert: true });
        if (thumbError) {
          // 사본 하나 때문에 되돌리지 않는다. 없으면 화면이 원본으로 떨어진다.
          console.error(`[library] 작은 사본을 올리지 못했습니다: ${thumbError.message}`);
          thumbPath = null;
        } else {
          // **되돌릴 목록에 넣는다.** 안 넣으면 저장이 엎어졌을 때 아무도
          // 못 찾는 파일이 용량만 차지한 채 남는다.
          uploaded.push(thumbPath);
        }
      }

      if (position === 0) coverThumbPath = thumbPath;

      rows.push({
        item_id: item.id,
        user_id: input.userId,
        position,
        path,
        mime_type: mimeType,
        thumb_path: thumbPath,
      });
    }

    const { error: imagesError } = await supabase.from("library_images").insert(rows);
    if (imagesError) throw new Error(imagesError.message);

    await supabase
      .from("library_items")
      .update({ cover_path: rows[0]?.path ?? null, cover_thumb_path: coverThumbPath })
      .eq("id", item.id);

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

  let query = scopedRead(
    supabase
      .from("library_items")
      .select("id,user_id,title,tool,aspect_ratio,source_type,source_id,image_count,cover_path,cover_thumb_path,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    readScope(viewer),
  );
  // 목록에만 건다. 한 건을 열 때는 안 건다 — 프로젝트를 고른 채로 다른 갈래의
  // 작업물 주소를 받으면 열리지 않는 편이 더 놀랍다.
  if (viewer.projectId) query = query.eq("project_id", viewer.projectId);

  const { data, error } = await query;
  if (error || !data) return [];

  /**
   * **원본과 사본을 둘 다 서명한다.**
   *
   * 사본으로 갈음하고 싶지만 그럴 수 없다 — `coverUrl` 은 화면에만 쓰이지
   * 않는다. 「저장된 이미지에서 고르기」가 이 주소를 받아 파일로 만들어
   * 상세페이지와 리디자인의 **생성 입력**으로 넘긴다. 거기에 512px 손실
   * 사본을 물리면 크레딧을 쓰는 결과물의 품질이 조용히 깎인다.
   *
   * 그래서 목록 카드가 쓸 `coverThumbUrl` 을 따로 낸다. 두 경로를 한 번의
   * `createSignedUrls` 에 함께 넣으므로 왕복은 늘지 않는다.
   */
  const covers = data
    .flatMap((row: { cover_path: string | null; cover_thumb_path: string | null }) =>
      [row.cover_path, row.cover_thumb_path])
    .filter(Boolean) as string[];
  const signed = covers.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(covers, SIGNED_URL_TTL_SECONDS)
    : { data: [] };

  const urlByPath = toUrlMap(signed.data);
  /**
   * 누가 만들었는지는 **남의 것이 섞일 때만** 붙인다.
   *
   * 혼자면 목록이 전부 자기 것이라 붙일 이유가 없고, 붙이면 회원끼리 이메일이
   * 보이는 길이 하나 생긴다.
   *
   * 팀에 있으면 붙인다. 팀 목록에는 남의 것이 섞이는데 누가 만든 건지 모르면
   * 「이건 누구 작업이지」를 물으러 나가야 한다. 같은 팀 사람의 메일 주소는
   * 팀 화면이 이미 명단으로 보여준다.
   */
  const scope = readScope(viewer);
  const emails = scope.isAdmin || scope.teamId
    ? await emailsByUserId(data.map((row: { user_id: string }) => row.user_id))
    : new Map<string, string>();

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
    coverThumbUrl: row.cover_thumb_path
      ? urlByPath.get(row.cover_thumb_path as string) ?? null
      : null,
    mine: row.user_id === viewer.userId,
    ownerEmail: emails.get(row.user_id as string) ?? null,
  }));
}

/**
 * 이 작업물이 이 사람에게 보이는가.
 *
 * **자식 표는 부모를 통해 판정한다.** `library_images` 에는 `team_id` 가
 * 없다 — 4단계에서 자식에 칸을 안 단 이유가 이것이다. 양쪽에 달면 둘이
 * 어긋나는 날이 오고, 그때 어느 쪽이 맞는지 정할 근거가 없다.
 *
 * 그래서 자식을 읽기 전에 부모를 한 번 확인한다. 질의가 하나 늘지만,
 * 「팀원의 것도 대충 보이게」 하는 어림짐작보다 낫다.
 */
/**
 * **내가 만든 것인가.** 팀도 전체 범위도 안 본다.
 *
 * `canSeeItem` 은 팀 것까지 보여 주는데, 내보내기는 그러면 안 된다 — 같은 팀
 * 사람의 그림이라도 가공해서 파일로 내려받는 것은 다른 일이다.
 */
async function ownsItem(viewer: LibraryViewer, itemId: string): Promise<boolean> {
  const { data } = await createSupabaseAdminClient()
    .from("library_items")
    .select("id")
    .eq("id", itemId)
    .eq("user_id", viewer.userId)
    .maybeSingle();
  return Boolean(data);
}

async function canSeeItem(viewer: LibraryViewer, itemId: string): Promise<boolean> {
  const { data } = await scopedRead(
    createSupabaseAdminClient().from("library_items").select("id").eq("id", itemId),
    readScope(viewer),
  ).maybeSingle();
  return Boolean(data);
}

/** 한 건의 이미지 전체. 서명 URL 이라 수명이 있다. */
export async function getLibraryItemImages(viewer: LibraryViewer, itemId: string) {
  const supabase = createSupabaseAdminClient();

  if (!(await canSeeItem(viewer, itemId))) return [];

  const { data, error } = await supabase
    .from("library_images")
    .select("position,path,mime_type")
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
 * 그림 한 장의 실제 바이트.
 *
 * 목록·뷰어는 Storage 서명 URL 을 그대로 쓴다. 이 길은 **내려받기 전용**이다 —
 * 우리 손을 거쳐야 저장된 형식과 무관하게 PNG 로 되돌려 줄 수 있기 때문이다.
 *
 * 서명 URL 이 하던 방어를 여기서는 코드가 대신한다. 지켜야 할 것이 셋이다.
 *
 * 1. **소유자 조건은 `libraryScope` 하나로 정한다.** 관리자용 질의를 따로
 *    두지 않는다 — 질의가 둘로 갈라지면 그 둘이 어긋나는 날이 사고 나는 날이다.
 * 2. **경로는 표에 적힌 것을 쓴다.** 주소로 받은 값을 이어 붙이면 그 값이
 *    그대로 저장소 경로가 된다.
 * 3. **형식은 실제 바이트로 정한다.** `mime_type` 칸에는 화면이 보낸 문자열이
 *    그대로 들어올 수 있어서, 그 값을 헤더로 흘리면 같은 출처에서 임의 문서가
 *    열린다. 못 알아보는 바이트는 그림이라고 말하지 않는다.
 */
export async function getLibraryImageFile(
  viewer: LibraryViewer,
  itemId: string,
  position: number,
  /**
   * 무엇을 하려고 읽는가.
   *
   * **기본은 `read` 라 기존 호출부가 안 바뀐다.** 광고 규격 내보내기만
   * `export` 를 넘겨 관리자에게도 소유자 조건을 건다 — 보고 지우는 것과
   * 가공해 내려받는 것은 무게가 다르다(`libraryScope` 머리말).
   */
  action: "read" | "export" = "read",
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const supabase = createSupabaseAdminClient();

  /**
   * **내보내기는 자기 것만 본다.** 「보기」와 「가공해 내려받기」는 무게가
   * 다르다 — ZIP 이 만들어지는 순간 서비스 밖으로 나가고 그 안에는 누구
   * 것인지 안 적힌다. 게다가 `/ad` 목록은 전체가 열린 사람에게 남의 것도
   * 싣는데 화면이 소유자를 안 보여 준다 — **본인도 남의 것인 줄 모른 채 뽑는다.**
   */
  const visible = action === "export"
    ? await ownsItem(viewer, itemId)
    : await canSeeItem(viewer, itemId);
  if (!visible) return null;

  const { data, error } = await supabase
    .from("library_images")
    .select("path")
    .eq("item_id", itemId)
    .eq("position", position);
  const path = (data as Array<{ path?: string }> | null)?.[0]?.path;
  if (error || !path) return null;

  const file = await supabase.storage.from(BUCKET).download(path);
  if (file.error || !file.data) return null;

  const bytes = Buffer.from(await file.data.arrayBuffer());
  return { bytes, mimeType: sniffImageMime(bytes, "application/octet-stream") };
}

/**
 * 삭제. 파일을 먼저 지운다.
 *
 * on delete cascade 는 행만 지우고 Storage 파일은 남긴다. 지웠다고 생각한
 * 이미지가 서버에 남아 있는 것이 가장 나쁘다.
 *
 * **관리자는 남의 것도 지운다.** 잘못 올라온 것을 내릴 사람이 아무도 없으면
 * 그대로 남는다 — 2026-09-04 운영자 판단.
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
  const imageQuery = supabase.from("library_images").select("path,thumb_path").eq("item_id", itemId);
  const { data: images, error: imagesError } = await (owner ? imageQuery.eq("user_id", owner) : imageQuery);

  /**
   * **못 읽으면 아무것도 지우지 않는다.**
   *
   * 여기서 조용히 넘어가면 지울 경로를 하나도 못 구한 채 아래 행 삭제가
   * 성공한다 — 행은 사라지고 파일은 전부 남는데 화면에는 「지웠다」가 뜬다.
   * 파일을 못 지울 것이면 행도 지우면 안 된다.
   */
  if (imagesError) {
    return { ok: false as const, message: `그림 목록을 읽지 못해 지우지 않았습니다: ${imagesError.message}` };
  }

  // **작은 사본도 함께 지운다.** 표를 지우면 사본의 자리를 아는 곳이 사라지므로,
  // 여기서 빠뜨리면 아무도 못 찾는 파일이 용량만 차지한 채 영영 남는다.
  const paths = (images ?? [])
    .flatMap((row: { path: string; thumb_path: string | null }) => [row.path, row.thumb_path])
    .filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

  const deleteQuery = supabase.from("library_items").delete().eq("id", itemId);
  const { error } = await (owner ? deleteQuery.eq("user_id", owner) : deleteQuery);

  return { ok: !error, message: error?.message };
}
