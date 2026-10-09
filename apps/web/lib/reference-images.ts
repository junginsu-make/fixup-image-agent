import { createSupabaseAdminClient } from "./supabase/admin";
import { canSeeReference, referenceVisibility } from "./teams/reference-scope";
import { canSeeOwnerEmails, canTouch } from "./access/core";
import {
  findLocalReferenceImage,
  getLocalDatabase,
  insertLocalReferenceImage,
  isLocalStoreEnabled,
  listLocalReferenceImages,
  localStoreRoot,
  readLocalReferenceFile,
  removeLocalReferenceFiles,
  writeLocalReferenceFile,
} from "./local-store";
import { persistReferenceImage, type ReferenceImageRow } from "../app/library/reference-upload";
import { gridPathsToRemove, gridThumbPath } from "./grid-thumbnail-path";
import { isOrdinaryReferenceId } from "./reference-copy-id";
import { makeGridThumbnail } from "./grid-thumbnail";
import type { ReferencePurpose } from "../app/api/reference-sets/schema";
import type { UserRole } from "./membership/types";

/**
 * 참고 이미지 — 라이브러리의 본보기 창고.
 *
 * 여기 들어온 그림은 카드뉴스·포스터·상세페이지가 전부 쓴다. 그래서 서버에서
 * 넣고 읽는 길이 하나여야 한다.
 *
 * 전에는 로컬은 API 로, 운영은 브라우저에서 Supabase 를 직접 불러 읽었다.
 * 길이 둘이면 화면마다 한쪽만 붙게 되고, 실제로 상세페이지의 선택창은
 * 운영에서 참고 이미지를 못 봤다. 두 모드를 여기서 한 번에 가른다.
 *
 * **올린 사람만 본다**(2026-09-28 사용자 결정). 2026-09-04 부터 회원 공용이었다 —
 * 내부 몇 사람이 쓸 때는 같은 본보기를 사람 수만큼 다시 올리지 않게 하는 편이
 * 나았다. 유료로 공개하면 모르는 고객끼리 같은 창고를 쓰게 되어 좁혔다. 운영자는
 * 전부 본다. 규칙은 `lib/teams/reference-scope.ts` 한 곳이다.
 *
 * 고치고 지우는 것은 올린 사람과 관리자만 한다.
 */

const BUCKET = "library";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface ReferenceImageView extends ReferenceImageRow {
  signedUrl: string | null;
  /** 목록 격자에 거는 사본. 없으면 화면이 `signedUrl` 로 떨어진다. */
  thumbUrl: string | null;
  /** 내가 올린 것인가. 지우기 단추를 보일지 정하는 값이다. */
  mine: boolean;
  /** 누가 올렸는가. **관리자에게만** 채운다 — 회원끼리 이메일이 보이면 안 된다. */
  ownerEmail: string | null;
  /** 회원이 지운 때. 관리자 「회원이 삭제한 자료」 목록에만 실린다. */
  deletedAt?: string;
}

/** 목록을 보는 사람. 클라이언트가 보낸 값이 아니라 세션에서 꺼낸 것만 넣는다. */
export interface ReferenceViewer {
  userId: string;
  role: UserRole;
  /** 이 사람의 팀. 없으면 개인이다. */
  teamId?: string | null;
}

/**
 * 이 그림을 고치거나 지울 수 있는가.
 *
 * 올린 사람, 그리고 **관리자**다.
 *
 * 회원끼리는 서로 못 지운다. 남이 올린 본보기를 지우면 그것을 쓰던 사람의
 * 세트와 작업이 조용히 깨지는데, 지운 쪽은 그 사실을 알 길이 없다.
 *
 * 관리자는 예외로 둔다. 관리자는 전부 보므로, 잘못 올라온 것을 내릴 수 있는
 * 사람이 아무도 없으면 그대로 남는다.
 *
 * 지우기 라우트는 행을 서버 권한으로 찾으므로 이 판정이 **유일한 문지기**다
 * (`app/api/reference-images/[id]/route.ts`).
 */
export function canModifyReferenceImage(
  viewer: { userId: string; role: UserRole },
  ownerId: string,
): boolean {
  // 판단은 `lib/access/core.ts` 가 한다. 여기서 따로 적으면 라이브러리와
  // 참고 이미지가 서로 다른 답을 내는 날이 온다.
  return canTouch(viewer, ownerId, "delete");
}

interface ReferenceImageDbRow {
  id: string;
  user_id: string;
  storage_path: string;
  thumb_path?: string | null;
  title: string | null;
  purpose: ReferencePurpose;
  width: number | null;
  height: number | null;
  created_at: string;
}

function toRow(row: ReferenceImageDbRow): ReferenceImageRow {
  return {
    id: row.id,
    userId: row.user_id,
    storagePath: row.storage_path,
    title: row.title,
    purpose: row.purpose,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

/** 로컬 파일은 이 경로로 내려 준다. 서명 URL 이 없으므로 자체 경로를 쓴다. */
export function localFileUrl(id: string): string {
  return `/api/reference-images/${id}/file`;
}

/**
 * 창고에 있는 그림.
 *
 * **누가 보나는 `referenceVisibility()` 하나가 정한다.** 회원은 내 것만,
 * 운영자는 전부다(2026-09-28 사용자 결정 — 그전에는 공용 창고였다).
 *
 * 서버 권한으로 읽으므로 **RLS 가 여기를 안 막는다.** 이 필터가 유일한
 * 문지기다 — 서명 URL 도 admin 클라이언트가 발급해 Storage 정책의
 * `{user_id}/...` 규칙에 안 걸린다.
 *
 * 400장 상한은 그대로 둔다. 운영자 목록은 전 회원 것이라 빨리 찰 수 있으므로,
 * 넘치면 최신 것부터 잘린다. 검색이나 쪽 나누기는 화면 쪽에서
 * 필요해질 때 붙인다.
 */
/**
 * 참고 이미지 한 장의 바이트 — **올린 사람만.**
 *
 * 목록(`listReferenceImages`)과 범위가 **일부러 다르다.** 목록은 운영자에게
 * 전부를 보여 준다. 그런데 **가공해서
 * 내려받는 것은 다른 일이다** — ZIP 은 서비스 밖으로 나가고 그 안에는 누구
 * 것인지 안 적힌다. 저장소가 이미 같은 판단을 해 뒀다
 * (`lib/access/core.ts:66` 「내보내기는 전체가 열린 사람도 자기 것만이다」).
 *
 * 그래서 **역할을 안 받는다.** 받으면 언젠가 「운영자는 예외」가 끼어든다.
 * 올린 사람의 id 하나로만 판정한다.
 */
export async function getReferenceImageFile(
  userId: string,
  id: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (isLocalStoreEnabled()) {
    const image = await findLocalReferenceImage(getLocalDatabase(), userId, id);
    if (!image) return null;
    try {
      const bytes = await readLocalReferenceFile(localStoreRoot(), image.storagePath);
      return { bytes: Buffer.from(bytes), mimeType: mimeFromPath(image.storagePath) };
    } catch {
      return null;
    }
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("reference_images")
    .select("storage_path,user_id")
    .eq("id", id)
    .eq("user_id", userId)
    // 회원이 지운 것은 없는 것이다 — 줄·파일은 보관되어 있다(2026-10-08).
    .is("deleted_at", null)
    .limit(1);
  const row = (data as Array<{ storage_path?: string }> | null)?.[0];
  if (error || !row?.storage_path) return null;

  const file = await supabase.storage.from(BUCKET).download(row.storage_path);
  if (file.error || !file.data) return null;
  return {
    bytes: Buffer.from(await file.data.arrayBuffer()),
    mimeType: mimeFromPath(row.storage_path),
  };
}

/**
 * 경로 끝으로 형식을 정한다.
 *
 * **`mime_type` 칸을 안 믿는다** — 화면이 보낸 문자열이 그대로 들어올 수 있고,
 * 그 값을 헤더로 흘리면 같은 출처에서 임의 문서가 열린다. 저장할 때 확장자를
 * `EXTENSIONS` 로 정해 붙이므로 경로가 더 믿을 만하다.
 */
function mimeFromPath(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  for (const [mime, ext] of Object.entries(EXTENSIONS)) {
    if (ext === extension) return mime;
  }
  return "application/octet-stream";
}

export async function listReferenceImages(viewer: ReferenceViewer): Promise<ReferenceImageView[]> {
  if (isLocalStoreEnabled()) {
    const images = await listLocalReferenceImages(getLocalDatabase(), viewer.userId);
    return images.map((image) => ({
      ...image,
      signedUrl: localFileUrl(image.id),
      // 로컬은 사본을 두지 않는다 — 개발용 저장소라 목록이 무거울 일이 없다.
      thumbUrl: null,
      mine: image.userId === viewer.userId,
      ownerEmail: null,
    }));
  }

  /**
   * **내 그림을 먼저, 그리고 절대 안 밀리게.**
   *
   * 운영자는 전 회원 것을 보므로 400장 상한을 전 회원이 나눠 쓴다. 한 번에 다
   * 읽으면 남이 최근에 많이 올린 날 **내 오래된 그림이 목록에서 사라진다**
   * (2026-09-17 독립 리뷰). 그래서 두 번 읽는다 — 내 것 400, 나머지 400.
   * 둘 다 색인을 타는 가벼운 질의다. 회원은 두 질의 모두 내 것만 돌려받는다
   * (`readReferences` 가 좁힌다).
   *
   * 차례도 이 순서다. 고르는 창은 내 그림부터 보게 된다(사용자 결정).
   */
  return readReferences(viewer, [
    (query) => query
      .eq("user_id", viewer.userId)
      .order("created_at", { ascending: false })
      .limit(400),
    (query) => query
      .order("created_at", { ascending: false })
      .limit(400),
  ]);
}

/**
 * 고른 그림 **낱개**를 같은 규칙으로 읽는다.
 *
 * 목록과 규칙이 갈리면 안 된다 — **목록에서 보이는데 쓰지는 못하는** 일이
 * 생긴다(2026-09-17 사용자 확인 요청으로 드러났다. 이미지 만들기가 저만의
 * 규칙으로 목록을 읽어, 다른 화면에서 보이는 공용 그림이 거기서는 없었다).
 *
 * **차례는 물어본 차례 그대로 돌려준다.** 프롬프트의 `Image 1·2·3` 이 이
 * 차례고, DB 가 주는 차례는 정해져 있지 않다.
 */
export async function referenceImagesByIds(
  viewer: ReferenceViewer,
  ids: string[],
): Promise<ReferenceImageView[]> {
  if (!ids.length) return [];
  const found = isLocalStoreEnabled()
    ? (await listReferenceImages(viewer)).filter((image) => ids.includes(image.id))
    : await readReferences(viewer, [(query) => query.in("id", ids)]);
  const byId = new Map(found.map((image) => [image.id, image]));
  return ids.map((id) => byId.get(id)).filter((image): image is ReferenceImageView => Boolean(image));
}

/**
 * **회원이 지운 참고 이미지**(관리자 「회원이 삭제한 자료」, 2026-10-08 — 계획 2단계). 최근에 지운 것부터 400장.
 *
 * **부르는 쪽이 관리자인지 먼저 확인해야 한다.** 회원이 부르면 자기가 지운 것만 나오지만, 회원 화면에는 이것을
 * 보이지 않는다.
 */
export async function listDeletedReferenceImages(viewer: ReferenceViewer): Promise<ReferenceImageView[]> {
  if (isLocalStoreEnabled()) return [];
  return readReferences(viewer, [
    (query) => query.order("deleted_at", { ascending: false }).limit(400),
  ], { deleted: true });
}

/** 서명까지 하려면 한 client 로 이어야 한다 — 질의와 저장소가 같은 것을 쓴다. */
function referenceQuery(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  return supabase
    .from("reference_images")
    .select("id,user_id,team_id,storage_path,thumb_path,title,purpose,width,height,created_at,deleted_at");
}

type ReferenceNarrow = (
  query: ReturnType<typeof referenceQuery>,
) => ReturnType<typeof referenceQuery>;

/**
 * 목록과 낱개가 **같은 규칙**을 타는 한 곳. 갈리면 한쪽이 조용히 넓어진다.
 *
 * 질의를 여럿 받는다. 앞에서 온 줄이 앞자리를 갖고 같은 줄은 한 번만 남는다 —
 * 「내 것 먼저, 그다음 나머지」를 그렇게 만든다.
 */
async function readReferences(
  viewer: ReferenceViewer,
  narrows: ReferenceNarrow[],
  options: { deleted?: boolean } = {},
): Promise<ReferenceImageView[]> {
  const visibility = referenceVisibility({
    userId: viewer.userId,
    isAdmin: canSeeOwnerEmails(viewer),
  });

  const supabase = createSupabaseAdminClient();
  const scoped = (narrow: ReferenceNarrow) => {
    /*
      **회원이 지운 것은 빼거나, 그것만 읽는다**(2026-10-08 — 계획 2단계). 줄·파일이 보관되므로 여기서 안
      거르면 지운 그림이 고르는 창에 다시 뜨고 생성 재료로 실려 나간다. 관리자도 보통 목록에서는 안 본다 —
      「회원이 삭제한 자료」(`listDeletedReferenceImages`)에서만 본다.
    */
    const kept = narrow(referenceQuery(supabase));
    const query = options.deleted ? kept.not("deleted_at", "is", null) : kept.is("deleted_at", null);
    if (visibility.kind === "own") return query.eq("user_id", visibility.userId);
    return query;
  };

  const results = await Promise.all(narrows.map((narrow) => scoped(narrow)));
  const byId = new Map<string, ReferenceImageDbRow & { team_id: string | null; deleted_at?: string | null }>();
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<ReferenceImageDbRow & { team_id: string | null; deleted_at?: string | null }>) {
      // 먼저 온 줄이 앞자리를 지킨다. 같은 줄이 두 질의에 다 나올 수 있다.
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }

  const rows = [...byId.values()].filter(
    // 질의와 같은 규칙을 한 번 더 본다. 조건을 빠뜨린 채로 배포되면 남의
    // 본보기가 조용히 새 나가는데, 그건 화면에서 티가 안 난다.
    (row) => canSeeReference(visibility, { userId: row.user_id, teamId: row.team_id }),
  );
  if (!rows.length) return [];

  /**
   * **원본과 사본을 둘 다 서명한다.**
   *
   * 목록 격자는 사본을 쓰지만, 확대와 fal 참고 전달은 원본을 쓴다. 한 번에
   * 모아 보내므로 왕복은 늘지 않는다.
   */
  const signed = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      rows.flatMap((row) => [row.storage_path, row.thumb_path].filter(Boolean) as string[]),
      SIGNED_URL_TTL_SECONDS,
    );
  if (signed.error) throw new Error(signed.error.message);

  const urlByPath = new Map(
    (signed.data ?? []).map((entry) => [entry.path ?? "", entry.signedUrl ?? null]),
  );
  // 관리자만 누가 올렸는지 본다. 회원에게는 "내 것인가"만 알려주면 된다.
  const emails = canSeeOwnerEmails(viewer)
    ? await emailsByUserId(rows.map((row) => row.user_id))
    : new Map<string, string>();

  return rows.map((row) => ({
    ...toRow(row),
    ...(options.deleted && row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    signedUrl: urlByPath.get(row.storage_path) ?? null,
    thumbUrl: row.thumb_path ? urlByPath.get(row.thumb_path) ?? null : null,
    mine: row.user_id === viewer.userId,
    ownerEmail: emails.get(row.user_id) ?? null,
  }));
}

/**
 * 올린(만든) 사람의 이메일. **관리자 목록에서만 부른다.** 캐릭터 목록도 쓴다(2026-10-08).
 *
 * 조인 대신 두 번 묻는다. PostgREST 임베드는 관계 이름이 바뀌면 조용히 빈
 * 값을 주는데, 여기서 빈 값은 "누가 올렸는지 모르는 목록"이 된다.
 */
export async function emailsByUserId(userIds: string[]): Promise<Map<string, string>> {
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

/**
 * 그림 한 장을 창고에 넣는다.
 *
 * 올리기와 되돌리기 순서는 persistReferenceImage 하나에만 둔다 — 두 모드가
 * 같은 순서로 움직여야 한 쪽만 파일이 남는 일이 없다.
 */
export async function saveReferenceImage(input: {
  userId: string;
  id: string;
  title: string;
  purpose: ReferencePurpose;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<ReferenceImageRow> {
  /*
    **uuid 4 만 받는다.** 5 는 관리자 복사본만의 표시다(`lib/reference-copy-id.ts`)
    — 복사본은 팀 이동을 따라가지 않는다. 화면이 id 를 정해 보내는 올리기에서
    5 를 받으면, 누구나 자기 그림을 「복사본」으로 꾸며 팀 이동을 비껴갈 수 있다.
    주소 한 곳이 아니라 여기서 막는다 — 창고에 넣는 길이 늘어도 함께 막힌다.
  */
  if (!isOrdinaryReferenceId(input.id)) throw new Error("그림 id 형식이 올바르지 않습니다.");
  const extension = EXTENSIONS[input.mimeType];
  if (!extension) throw new Error("PNG, JPG, WEBP 이미지만 보관할 수 있습니다.");
  const file = new File([new Uint8Array(input.bytes)], `${input.id}.${extension}`, { type: input.mimeType });

  if (isLocalStoreEnabled()) {
    const database = getLocalDatabase();
    const root = localStoreRoot();
    return persistReferenceImage(
      { file, title: input.title, purpose: input.purpose },
      {
        createId: () => input.id,
        getUserId: async () => input.userId,
        upload: (storagePath, selected) => writeLocalReferenceFile(root, storagePath, selected),
        insert: (row) => insertLocalReferenceImage(database, input.userId, {
          id: row.id,
          storagePath: row.storage_path,
          title: row.title,
          purpose: row.purpose,
          width: null,
          height: null,
        }),
        remove: (paths) => removeLocalReferenceFiles(root, paths),
      },
    );
  }

  const supabase = createSupabaseAdminClient();
  return persistReferenceImage(
    { file, title: input.title, purpose: input.purpose },
    {
      createId: () => input.id,
      getUserId: async () => input.userId,
      upload: async (storagePath, selected) => {
        const bytes = Buffer.from(await selected.arrayBuffer());
        const result = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, bytes, { contentType: selected.type, upsert: false });
        if (result.error) throw new Error(result.error.message);

        /**
         * 목록에 걸 사본.
         *
         * 운영자에게는 한 화면에 400장까지 뜬다. 라이브러리에서 가장
         * 무거운 화면이다.
         *
         * **원본은 그대로 둔다.** 이 그림은 화면에만 뜨는 것이 아니라 fal 에
         * 참고로 실려 나간다 — 사본을 물리면 생성 품질이 조용히 깎인다.
         *
         * 못 만들거나 못 올려도 **올리기를 막지 않는다.** 없으면 화면이
         * 원본으로 떨어진다.
         */
        const thumbnail = await makeGridThumbnail(bytes);
        if (!thumbnail) return null;

        const thumbPath = gridThumbPath(storagePath);
        const thumbResult = await supabase.storage
          .from(BUCKET)
          .upload(thumbPath, thumbnail, { contentType: "image/webp", upsert: true });
        if (thumbResult.error) {
          console.error(`[reference] 사본을 올리지 못했습니다: ${thumbResult.error.message}`);
          return null;
        }
        return thumbPath;
      },
      insert: async (row) => {
        const result = await supabase
          .from("reference_images")
          .insert(row)
          .select("id,user_id,storage_path,thumb_path,title,purpose,width,height,created_at")
          .single();
        if (result.error) throw new Error(result.error.message);
        return toRow(result.data as ReferenceImageDbRow);
      },
      remove: async (paths) => {
        const result = await supabase.storage.from(BUCKET).remove(paths);
        if (result.error) throw new Error(result.error.message);
      },
    },
  );
}

/**
 * 이 회원의 라이브러리에 **이미 있는 제목**만 골라 돌려준다.
 *
 * 캐릭터 각도를 다시 채울 때 같은 제목이 둘이 되지 않게 먼저 본다. 제목이
 * 캐릭터 각도의 유일한 손잡이라 둘이 되면 어느 쪽을 붙일지 갈린다.
 */
export async function referenceTitlesOf(userId: string, titles: readonly string[]): Promise<Set<string>> {
  if (!titles.length) return new Set();
  if (isLocalStoreEnabled()) {
    return getLocalDatabase().read((data) => new Set(
      data.referenceImages
        .filter((image) => image.userId === userId && titles.includes(image.title ?? ""))
        .map((image) => image.title ?? ""),
    ));
  }
  /*
    **제목마다 따로 묻는다.** `in()` 은 값 안의 따옴표·역슬래시를 거르지 않아,
    이름에 `"` 가 있으면 조회가 깨진다(2026-10-07 리뷰). 각도는 많아야 여섯이다.
  */
  const supabase = createSupabaseAdminClient();
  const found = await Promise.all(titles.map(async (title) => {
    const { data, error } = await supabase
      .from("reference_images").select("id").eq("user_id", userId).eq("title", title).is("deleted_at", null).limit(1);
    if (error) throw new Error(error.message);
    return (data ?? []).length ? title : null;
  }));
  return new Set(found.filter((title): title is string => title !== null));
}

/**
 * 제목이 같은 참고 이미지를 지운다.
 *
 * 캐릭터가 각도마다 「이름 (캐릭터) · 정면」 이라는 정해진 제목으로 들어간다.
 * 각도를 다시 만들거나 캐릭터를 지울 때 그 줄을 찾아 갈아 끼우려면 제목이
 * 유일한 손잡이다 — 참고 이미지 쪽에는 캐릭터를 가리키는 칸이 없다.
 *
 * 없으면 아무 일도 하지 않는다. 지울 것이 없는 것은 실패가 아니다.
 */
export async function removeReferenceImagesByTitle(
  userId: string,
  title: string,
  /**
   * 회원이 지운 캐릭터를 관리자가 완전히 지울 때, 그 캐릭터와 **함께 보관된 사본만**(지운 때가 같은 것). 안 주면
   * 살아 있는 것만 — 보관 중인 옛 캐릭터 사본을 같은 이름의 새 캐릭터가 지우지 않게(2026-10-08).
   */
  deletedAt: string | null = null,
): Promise<void> {
  if (isLocalStoreEnabled()) {
    const paths = await getLocalDatabase().update((data) => {
      const matched = data.referenceImages.filter(
        (image) => image.userId === userId && image.title === title,
      );
      const ids = new Set(matched.map((image) => image.id));
      data.referenceImages = data.referenceImages.filter((image) => !ids.has(image.id));
      // 세트에서도 뺀다. 남겨 두면 없는 그림을 가리키는 항목이 생긴다.
      for (const set of data.referenceSets) {
        set.items = set.items.filter((item) => !ids.has(item.referenceImageId));
      }
      return matched.map((image) => image.storagePath);
    });
    if (paths.length) await removeLocalReferenceFiles(localStoreRoot(), paths);
    return;
  }

  const supabase = createSupabaseAdminClient();
  const matching = supabase
    .from("reference_images")
    .select("id,storage_path,thumb_path")
    .eq("user_id", userId)
    .eq("title", title);
  const { data } = await (deletedAt ? matching.eq("deleted_at", deletedAt) : matching.is("deleted_at", null));
  if (!data?.length) return;

  // 행을 먼저 지운다. 파일이 먼저 사라지면 목록에는 남고 미리보기만 깨진다.
  await supabase.from("reference_images").delete().in("id", data.map((row) => row.id));
  // 사본도 함께 지운다. 행이 사라지면 그 자리를 아는 곳이 없어진다.
  await supabase.storage.from(BUCKET).remove(gridPathsToRemove(
    data.map((row) => ({ path: row.storage_path as string, thumbPath: row.thumb_path as string | null })),
  ));
}
