import { analyzeStyleImage, type StyleReferenceMatch } from "@fixup/pdp-core";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createPdpLlmOrNull } from "./pdp/providers";
import { sliceTallReference } from "./pdp/slice-image";
import { isLocalStoreEnabled } from "./local-store";
import { makeGridThumbnail } from "./grid-thumbnail";
import { gridPathsToRemove, gridThumbPath } from "./grid-thumbnail-path";

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
/**
 * 라이브러리의 참고 이미지(`reference_images`)가 놓인 버킷.
 *
 * **`references` 가 아니다.** 경로가 `{userId}/references/...` 로 시작해서
 * 헷갈리지만 파일은 `library` 에 있다(`lib/reference-images.ts` 를 비롯한
 * 아홉 곳이 전부 그 버킷을 쓴다). 여기서 잘못 짚는 동안 다운로드가 늘 실패했고,
 * 실패는 `if (!file) return null` 로 조용히 걸러져 **「라이브러리의 참고
 * 이미지도 여기서 같이 보인다」가 한 번도 동작하지 않았다.** 오류도 로그도
 * 남지 않았다.
 */
const LIBRARY_BUCKET = "library";
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
  /**
   * 격자에 거는 작은 사본. **없으면 `null` 이다 — 원본으로 떨어뜨리지 않는다.**
   *
   * 떨어뜨릴지는 거는 쪽(`app/_components/grid-src.ts`)이 정한다. 여기서
   * 채워 버리면 화면이 사본인지 원본인지 구분할 수 없어진다.
   */
  thumbUrl: string | null;
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
  /*
    서술을 만들 때도 **조각으로 나눠 보낸다.**

    상세페이지 레퍼런스는 1080×15000 처럼 길다. 통째로 보내면 글 모델이 긴 변
    기준으로 줄여 폭 100픽셀짜리 띠를 보게 되고, 그 상태로 「팔레트·서체·구성」을
    적으라고 하면 아무 말이나 적는다. 그 서술이 자동 추천의 유일한 근거다.

    기획과 같은 규칙을 쓴다 — 짧아도 폭이 크면 줄인다(`shrinkWhole`).
  */
  const slices = await sliceTallReference(
    { imageBase64: input.imageBase64, mimeType: input.mimeType },
    { shrinkWhole: true },
  );
  const description = await analyzeStyleImage(
    slices.map((slice) => ({ base64: slice.imageBase64, mimeType: slice.mimeType })),
    createPdpLlmOrNull() ?? undefined,
  );

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
  const bytes = Buffer.from(input.imageBase64, "base64");
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: input.mimeType,
      upsert: true,
    });

  if (uploadError) {
    // 경로가 빈 행이 남으면 목록에서 이미지가 안 뜬다. 되돌린다.
    await supabase.from("style_references").delete().eq("id", row.id);
    return { ok: false as const, message: uploadError.message };
  }

  /*
    **목록용 작은 사본도 함께 올린다.**

    여기 쌓이는 것은 AI 가 만든 상세페이지 조각이라 한 장이 2MB 안팎이고,
    1080×15000 처럼 긴 것도 있다. 사본 없이 격자에 깔면 창 한 번에 수십 MB 가
    오간다 — 라이브러리·포스터·참고 이미지가 이미 같은 이유로 사본을 쓴다.

    **사본을 못 만들어도 등록은 막지 않는다.** 원본은 이미 올라가 있고,
    화면은 사본이 없으면 원본으로 떨어뜨린다(`grid-src.ts`). 여기서 되돌리면
    「분석이 실패해도 등록은 막지 않는다」는 이 함수의 판단과 어긋난다.
  */
  let thumbPath: string | null = null;
  const thumbnail = await makeGridThumbnail(bytes);
  if (thumbnail) {
    const candidate = gridThumbPath(path);
    const { error: thumbError } = await supabase.storage
      .from(BUCKET)
      .upload(candidate, thumbnail, { contentType: "image/webp", upsert: true });
    if (thumbError) {
      // 한 줄 남긴다. 조용히 넘어가면 사본이 안 생기는 것을 아무도 모른다.
      console.error(`[style-reference] 작은 사본을 올리지 못했습니다: ${thumbError.message}`);
    } else {
      thumbPath = candidate;
    }
  }

  await supabase.from("style_references").update({ path, thumb_path: thumbPath }).eq("id", row.id);
  return { ok: true as const, id: row.id as string, description };
}

export async function listUserStyleReferences(userId: string): Promise<UserStyleReference[]> {
  // 로컬 확인 모드에는 이 표가 없다. 비어 있다고 답한다 — 500 은 거짓말이다.
  if (isLocalStoreEnabled()) return [];
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("style_references")
    .select("id,name,source,description,path,thumb_path,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data?.length) return [];

  /**
   * **원본과 사본을 둘 다 서명한다.**
   *
   * 격자는 사본을, 고르기와 생성 입력은 원본을 쓴다 — `lib/reference-images.ts`
   * 와 같은 규약이다. 한 번에 모아 보내므로 왕복은 늘지 않는다.
   */
  const paths = data
    .flatMap((row: { path: string; thumb_path?: string | null }) => [row.path, row.thumb_path])
    .filter(Boolean) as string[];
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
    thumbUrl: row.thumb_path ? urlByPath.get(row.thumb_path as string) ?? null : null,
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
      const { data: file, error: downloadError } = await supabase.storage
        .from(LIBRARY_BUCKET).download(row.storage_path as string);
      if (!file) {
        // 한 줄 남긴다. 조용히 걸러지면 전량 탈락해도 아무도 모른다.
        console.error(`[style-reference] 라이브러리 참고 이미지를 못 읽었습니다(${row.storage_path}): ${downloadError?.message ?? "알 수 없음"}`);
        return null;
      }
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

/**
 * 이 행의 주인은 누구인가. 없으면 `null`.
 *
 * **삭제가 세 가지를 갈라 답하려면 필요하다**(C-10-c). 남의 것(404)과 이미 지운
 * 것(멱등 성공)은 사용자 범위로만 찾으면 **둘 다 「없음」으로 같아 보인다.**
 * 그래서 주인을 한 번 묻는다.
 *
 * 이것이 UUID 하나의 존재 여부를 알려 주기는 한다. UUIDv4 는 찍어서 맞힐 수
 * 없으므로 실질적인 값이 없고, 대신 사용자가 두 번 눌러도 오류를 안 본다.
 */
export async function ownerOfStyleReference(id: string): Promise<string | null> {
  if (isLocalStoreEnabled()) return null;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("style_references")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

export async function deleteUserStyleReference(userId: string, id: string) {
  const supabase = createSupabaseAdminClient();

  const { data: row } = await supabase
    .from("style_references")
    .select("path,thumb_path")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  /*
    파일을 먼저 지운다. 행만 지우면 이미지가 서버에 남는다.

    **사본도 같이 지운다.** 행이 사라지면 사본의 자리를 아는 근거가 없어진다 —
    앞선 작업에서 네 번 반복해 잡힌 실수라 `gridPathsToRemove` 로 모은다.
  */
  const toRemove = gridPathsToRemove([{
    path: (row?.path as string | null) ?? null,
    thumbPath: (row?.thumb_path as string | null) ?? null,
  }]);
  if (toRemove.length) await supabase.storage.from(BUCKET).remove(toRemove);

  const { error } = await supabase
    .from("style_references")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  /*
    **지운 것과 없던 것을 갈라 답한다**(C-10-c).

    전에는 둘 다 `ok: true` 였다. 두 번 눌러도 같은 답이라는 점은 맞지만,
    부르는 쪽이 「정말 있었나」를 알 길이 없었다.
  */
  return { ok: !error, deleted: Boolean(row) && !error, message: error?.message };
}
