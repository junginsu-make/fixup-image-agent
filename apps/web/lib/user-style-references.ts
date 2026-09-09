import { analyzeStyleImage, type StyleReferenceMatch } from "@fixup/pdp-core";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createPdpLlmOrNull } from "./pdp/providers";
import { isLocalStoreEnabled } from "./local-store";

/**
 * 사용자별 스타일 레퍼런스.
 *
 * 공용 레퍼런스는 두지 않는다. 전역이면 A 셀러가 올린 디자인이 B 셀러의 생성
 * 결과에 씌워진다 — 출시 전 기획물이 경쟁사에 새어나가고, 아무나 올린 것이
 * 섞여 "어울리는 레퍼런스를 고른다"는 전제도 무너진다.
 *
 * 임베딩을 쓰지 않는다. 레퍼런스 선택은 LLM 이 한다 — 임베딩으로는 못 고른다는
 * 것을 이미 쟀다(위스키를 포함해 모든 질의에서 "산뜻한 파스텔"이 1위였다).
 * 사용자별로 나누면 대부분 열 몇 장이라 좁힐 일도 없다.
 */

const BUCKET = "references";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** LLM 에 한 번에 넘길 수 있는 수. 서술 한 건이 약 300자다. */
export const MAX_USER_REFERENCES = 40;

export type StyleReferenceSource = "upload" | "generated" | "seed";

export interface UserStyleReference {
  id: string;
  name: string;
  source: StyleReferenceSource;
  description: string;
  createdAt: string;
  /** 목록 표시용. 서명 URL 이라 수명이 있다. */
  url: string | null;
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

function normalizeSource(value: unknown): StyleReferenceSource {
  return value === "generated" || value === "seed" ? value : "upload";
}

/**
 * 레퍼런스를 등록한다.
 *
 * **분석은 곁다리다.** 이미지 생성에는 레퍼런스 이미지가 fal 로 원본 그대로
 * 첨부되고(`image_urls`), 무엇을 가져갈지는 프롬프트가 지시한다
 * (`pdp.reference-policy.ts`). 서술은 **자동 추천**에만 쓰인다 — "이 상품에
 * 어울리는 레퍼런스를 골라라"를 LLM 에게 물을 때 텍스트가 필요하기 때문이다.
 *
 * 그래서 **분석이 실패해도 등록은 막지 않는다.** 예전에는 서술이 없으면 등록을
 * 거부했는데, 그러면 화면이 "분석하는 중…"에 갇히고 사용자는 이유를 알 수 없었다.
 * 생성에는 아무 문제가 없는데도 레퍼런스를 쓸 수 없었다.
 */
export async function registerUserStyleReference(input: {
  userId: string;
  name: string;
  source: StyleReferenceSource;
  imageBase64: string;
  mimeType: string;
}) {
  const description = await analyzeStyleImage(input.imageBase64, input.mimeType, createPdpLlmOrNull() ?? undefined);

  const supabase = createSupabaseAdminClient();
  const { data: row, error } = await supabase
    .from("style_references")
    .insert({
      user_id: input.userId,
      name: input.name.slice(0, 80),
      source: input.source,
      path: "",
      mime_type: input.mimeType,
      description,
    })
    .select("id")
    .single();

  if (error || !row) {
    return { ok: false as const, message: error?.message ?? "저장하지 못했습니다." };
  }

  const path = `${input.userId}/${row.id}.${extensionFor(input.mimeType)}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(input.imageBase64, "base64"), {
      contentType: input.mimeType,
      upsert: true,
    });

  if (uploadError) {
    // 경로가 빈 행이 남으면 목록에서 이미지가 안 뜬다. 되돌린다.
    await supabase.from("style_references").delete().eq("id", row.id);
    return { ok: false as const, message: uploadError.message };
  }

  await supabase.from("style_references").update({ path }).eq("id", row.id);
  return { ok: true as const, id: row.id as string, description };
}

export async function listUserStyleReferences(userId: string): Promise<UserStyleReference[]> {
  // 로컬 확인 모드에는 이 표가 없다. 비어 있다고 답한다 — 500 은 거짓말이다.
  if (isLocalStoreEnabled()) return [];
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("style_references")
    .select("id,name,source,description,path,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data?.length) return [];

  const paths = data.map((row: { path: string }) => row.path).filter(Boolean);
  const signed = paths.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    : { data: [] };

  const urlByPath = new Map<string, string>();
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  }

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    source: normalizeSource(row.source),
    description: row.description as string,
    createdAt: String(row.created_at),
    url: urlByPath.get(row.path as string) ?? null,
  }));
}

/**
 * 생성에 넘길 후보. 이미지 본문까지 채워서 돌려준다.
 *
 * **이 사용자의 것만** 담는다. 공용은 없다.
 */
export async function loadUserReferenceCandidates(userId: string): Promise<StyleReferenceMatch[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("style_references")
    .select("id,name,description,path,mime_type")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_USER_REFERENCES);

  if (error || !data?.length) return [];

  const loaded = await Promise.all(
    data.map(async (row: Record<string, unknown>) => {
      const { data: file } = await supabase.storage.from(BUCKET).download(row.path as string);
      if (!file) return null;
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      return {
        id: row.id as string,
        name: row.name as string,
        description: row.description as string,
        imageBase64: base64,
        mimeType: row.mime_type as string,
        // LLM 이 고르므로 유사도는 쓰지 않는다. 형태를 맞추려고 둔다.
        similarity: 1,
      } satisfies StyleReferenceMatch;
    }),
  );

  const own = loaded.filter(Boolean) as StyleReferenceMatch[];
  // 라이브러리의 참고 이미지도 여기서 같이 보인다.
  // 표가 둘이면 사용자가 어디에 뒀는지 못 찾는다. 올린 곳이 어디든 세 도구가 다 쓴다.
  return [...own, ...await loadLibraryReferences(supabase, userId, MAX_USER_REFERENCES - own.length)];
}

/** 라이브러리(reference_images)의 그림을 상세페이지 레퍼런스 형태로 바꾼다. */
async function loadLibraryReferences(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  limit: number,
): Promise<StyleReferenceMatch[]> {
  if (limit <= 0) return [];
  const { data, error } = await supabase
    .from("reference_images")
    .select("id,title,storage_path")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data?.length) return [];

  const loaded = await Promise.all(
    data.map(async (row: Record<string, unknown>) => {
      const { data: file } = await supabase.storage.from(BUCKET).download(row.storage_path as string);
      if (!file) return null;
      const path = String(row.storage_path);
      const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
      return {
        id: row.id as string,
        name: (row.title as string | null) ?? "라이브러리 참고 이미지",
        description: "라이브러리에 올린 참고 이미지",
        imageBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        mimeType: extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
          : extension === ".webp" ? "image/webp" : "image/png",
        similarity: 1,
      } satisfies StyleReferenceMatch;
    }),
  );
  return loaded.filter(Boolean) as StyleReferenceMatch[];
}

export async function deleteUserStyleReference(userId: string, id: string) {
  const supabase = createSupabaseAdminClient();

  const { data: row } = await supabase
    .from("style_references")
    .select("path")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  // 파일을 먼저 지운다. 행만 지우면 이미지가 서버에 남는다.
  if (row?.path) await supabase.storage.from(BUCKET).remove([row.path as string]);

  const { error } = await supabase
    .from("style_references")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  return { ok: !error, message: error?.message };
}
