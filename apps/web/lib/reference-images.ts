import { createSupabaseAdminClient } from "./supabase/admin";
import {
  getLocalDatabase,
  insertLocalReferenceImage,
  isLocalStoreEnabled,
  listLocalReferenceImages,
  localStoreRoot,
  removeLocalReferenceFiles,
  writeLocalReferenceFile,
} from "./local-store";
import { persistReferenceImage, type ReferenceImageRow } from "../app/library/reference-upload";
import type { ReferencePurpose } from "../app/api/reference-sets/schema";

/**
 * 참고 이미지 — 라이브러리의 공용 창고.
 *
 * 여기 들어온 그림은 카드뉴스·포스터·상세페이지가 전부 쓴다. 그래서 서버에서
 * 넣고 읽는 길이 하나여야 한다.
 *
 * 전에는 로컬은 API 로, 운영은 브라우저에서 Supabase 를 직접 불러 읽었다.
 * 길이 둘이면 화면마다 한쪽만 붙게 되고, 실제로 상세페이지의 선택창은
 * 운영에서 참고 이미지를 못 봤다. 두 모드를 여기서 한 번에 가른다.
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
}

interface ReferenceImageDbRow {
  id: string;
  user_id: string;
  storage_path: string;
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

export async function listReferenceImages(userId: string): Promise<ReferenceImageView[]> {
  if (isLocalStoreEnabled()) {
    const images = await listLocalReferenceImages(getLocalDatabase(), userId);
    return images.map((image) => ({ ...image, signedUrl: localFileUrl(image.id) }));
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("reference_images")
    .select("id,user_id,storage_path,title,purpose,width,height,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ReferenceImageDbRow[];
  if (!rows.length) return [];

  const signed = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((row) => row.storage_path), SIGNED_URL_TTL_SECONDS);
  if (signed.error) throw new Error(signed.error.message);

  const urlByPath = new Map(
    (signed.data ?? []).map((entry) => [entry.path ?? "", entry.signedUrl ?? null]),
  );
  return rows.map((row) => ({
    ...toRow(row),
    signedUrl: urlByPath.get(row.storage_path) ?? null,
  }));
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
        const result = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, selected, { contentType: selected.type, upsert: false });
        if (result.error) throw new Error(result.error.message);
      },
      insert: async (row) => {
        const result = await supabase
          .from("reference_images")
          .insert(row)
          .select("id,user_id,storage_path,title,purpose,width,height,created_at")
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
