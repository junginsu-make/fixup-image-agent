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
import { makeGridThumbnail } from "./grid-thumbnail";
import type { ReferencePurpose } from "../app/api/reference-sets/schema";
import type { UserRole } from "./membership/types";

/**
 * 참고 이미지 — 라이브러리의 공용 창고.
 *
 * 여기 들어온 그림은 카드뉴스·포스터·상세페이지가 전부 쓴다. 그래서 서버에서
 * 넣고 읽는 길이 하나여야 한다.
 *
 * 전에는 로컬은 API 로, 운영은 브라우저에서 Supabase 를 직접 불러 읽었다.
 * 길이 둘이면 화면마다 한쪽만 붙게 되고, 실제로 상세페이지의 선택창은
 * 운영에서 참고 이미지를 못 봤다. 두 모드를 여기서 한 번에 가른다.
 *
 * **회원 공용이다.** 여기 들어온 그림은 "따라 그릴 본보기"라, 한 사람이 올린
 * 것을 다른 사람이 못 쓰면 같은 그림을 사람 수만큼 다시 올려야 한다. 작업물과
 * 다른 점이 이것이다 — 작업물은 각자의 결과라 남에게 보이면 안 된다.
 *
 * **읽기만 공용이다.** 고치고 지우는 것은 올린 사람만 한다. 남이 올린 본보기가
 * 사라지면 그것을 쓰던 다른 사람의 작업이 조용히 깨진다.
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
 * 관리자는 예외로 둔다. 참고 이미지는 회원 공용 창고라 잘못 올라온 것이
 * 모두에게 보인다 — 내릴 수 있는 사람이 아무도 없으면 그대로 남는다.
 *
 * 목록 읽기가 모두에게 열리면서 이 판정이 **꼭 필요해졌다.** 전에는 남의
 * 행이 애초에 보이지 않아 못 지웠지만, 이제는 보인다.
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
 * **누가 보나는 `referenceVisibility()` 하나가 정한다.** 팀이 안 붙은 것은
 * 누구나, 팀에 묶인 것은 그 팀만, 운영자는 전부다.
 *
 * 서버 권한으로 읽으므로 **RLS 가 여기를 안 막는다.** 이 필터가 유일한
 * 문지기다 — 서명 URL 도 admin 클라이언트가 발급해 Storage 정책의
 * `{user_id}/...` 규칙에 안 걸린다.
 *
 * 400장 상한은 그대로 둔다. 공용이 되면서 한 사람이 보던 수보다 훨씬 빨리
 * 찰 것이므로, 넘치면 최신 것부터 잘린다. 검색이나 쪽 나누기는 화면 쪽에서
 * 필요해질 때 붙인다.
 */
/**
 * 참고 이미지 한 장의 바이트 — **올린 사람만.**
 *
 * 목록(`listReferenceImages`)과 범위가 **일부러 다르다.** 목록은 공용 창고라
 * 팀이 안 붙은 것을 누구나 보고, 운영자는 전부 본다. 그런데 **가공해서
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

  const visibility = referenceVisibility({
    userId: viewer.userId,
    teamId: viewer.teamId ?? null,
    isAdmin: canSeeOwnerEmails(viewer),
  });

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("reference_images")
    .select("id,user_id,team_id,storage_path,thumb_path,title,purpose,width,height,created_at")
    .order("created_at", { ascending: false })
    .limit(400);
  // 400장 상한에 걸리기 전에 거른다. 뽑아 놓고 코드에서 버리면, 남의 팀 것이
  // 상한을 다 차지해 내 것이 잘려 나갈 수 있다.
  if (visibility.kind === "team") {
    query = query.or(
      `team_id.is.null,team_id.eq.${visibility.teamId},user_id.eq.${visibility.userId}`,
    );
  } else if (visibility.kind === "loose") {
    query = query.or(`team_id.is.null,user_id.eq.${visibility.userId}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as Array<ReferenceImageDbRow & { team_id: string | null }>).filter(
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
    signedUrl: urlByPath.get(row.storage_path) ?? null,
    thumbUrl: row.thumb_path ? urlByPath.get(row.thumb_path) ?? null : null,
    mine: row.user_id === viewer.userId,
    ownerEmail: emails.get(row.user_id) ?? null,
  }));
}

/**
 * 올린 사람의 이메일. **관리자 목록에서만 부른다.**
 *
 * 조인 대신 두 번 묻는다. PostgREST 임베드는 관계 이름이 바뀌면 조용히 빈
 * 값을 주는데, 여기서 빈 값은 "누가 올렸는지 모르는 목록"이 된다.
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
         * 창고는 **공용**이라 한 화면에 400장까지 뜬다. 라이브러리에서 가장
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
 * 제목이 같은 참고 이미지를 지운다.
 *
 * 캐릭터가 각도마다 「이름 (캐릭터) · 정면」 이라는 정해진 제목으로 들어간다.
 * 각도를 다시 만들거나 캐릭터를 지울 때 그 줄을 찾아 갈아 끼우려면 제목이
 * 유일한 손잡이다 — 참고 이미지 쪽에는 캐릭터를 가리키는 칸이 없다.
 *
 * 없으면 아무 일도 하지 않는다. 지울 것이 없는 것은 실패가 아니다.
 */
export async function removeReferenceImagesByTitle(userId: string, title: string): Promise<void> {
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
  const { data } = await supabase
    .from("reference_images")
    .select("id,storage_path,thumb_path")
    .eq("user_id", userId)
    .eq("title", title);
  if (!data?.length) return;

  // 행을 먼저 지운다. 파일이 먼저 사라지면 목록에는 남고 미리보기만 깨진다.
  await supabase.from("reference_images").delete().in("id", data.map((row) => row.id));
  // 사본도 함께 지운다. 행이 사라지면 그 자리를 아는 곳이 없어진다.
  await supabase.storage.from(BUCKET).remove(gridPathsToRemove(
    data.map((row) => ({ path: row.storage_path as string, thumbPath: row.thumb_path as string | null })),
  ));
}
