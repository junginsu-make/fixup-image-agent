import { readFile } from "node:fs/promises";
import { hasFullScope, viewerFrom } from "../../../../../../../../lib/access/core";
import path from "node:path";
import { authenticateApiMember } from "../../../../../../../../lib/membership/api";
import { isLocalStoreEnabled, localStoreRoot } from "../../../../../../../../lib/local-store";
import { posterStoresForUser } from "../../../../../../../../lib/poster/stores";
import { createSupabaseAdminClient } from "../../../../../../../../lib/supabase/admin";
import { usesAdminLookup } from "./admin-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; index: string }> };

/** 결과는 라이브러리 버킷에 있다. 서명 URL 대신 여기서 흘려보낸다 — 화면이 쓰는 주소가 하나여야 한다. */
async function downloaded(assetPath: string): Promise<Buffer> {
  const result = await createSupabaseAdminClient().storage.from("library").download(assetPath);
  if (result.error || !result.data) throw new Error(result.error?.message ?? "이미지를 읽지 못했습니다.");
  return Buffer.from(await result.data.arrayBuffer());
}

/**
 * 관리자가 볼 때만 쓰는 조회. 소유자 조건을 걸지 않는다.
 *
 * 회원이 쓰는 길은 손대지 않는다. 같은 함수에 「관리자면 조건을 뺀다」를
 * 심어 두면, 언젠가 그 조건이 어긋나 회원에게 남의 그림이 열린다.
 */
async function adminAssetPath(
  projectId: string,
  key: string,
): Promise<{ assetPath: string; thumbPath: string | null } | null> {
  const base = createSupabaseAdminClient()
    .from("poster_images")
    .select("asset_path,thumb_path")
    .eq("project_id", projectId);
  /**
   * **번호가 아니라 줄 id 로 찾는다.**
   *
   * `variant_index` 는 그 요청 안의 배열 번호라 회차가 둘 이상이면 같은 값이
   * 여럿 생긴다. 예전에는 그것으로 `maybeSingle()` 을 불러서, 두 번 만든 작업을
   * 관리자가 열면 다중 행 오류로 `data` 가 비고 **모든 변형이 404** 였다.
   * 회원 갈래는 `find()` 라 첫 줄을 집어 통과했으니, 같은 그림이 관리자에게만
   * 안 보였다.
   *
   * 옛 주소(숫자 번호)는 아직 열려 있는 탭이나 캐시가 들고 있을 수 있다. 그때는
   * 가장 최근 줄을 준다 — 화면이 비는 것보다 낫다.
   */
  const byId = isNumericKey(key)
    ? await base.eq("variant_index", Number(key)).order("created_at", { ascending: false }).limit(1)
    : await base.eq("id", key).limit(1);
  const row = (byId.data ?? [])[0] as { asset_path?: string; thumb_path?: string | null } | undefined;
  return row?.asset_path
    ? { assetPath: row.asset_path, thumbPath: row.thumb_path ?? null }
    : null;
}

/** 옛 주소인가. 새 주소는 이미지 줄의 uuid 다. */
function isNumericKey(key: string): boolean {
  return /^\d+$/.test(key);
}

/**
 * 이 주소가 가리키는 줄. **줄 id 가 먼저다.**
 *
 * 옛 주소는 변형 번호였고 회차가 둘 이상이면 같은 값이 여럿이다. 그때는
 * 가장 나중에 만들어진 것을 준다 — 화면이 비는 것보다 낫다.
 */
function pickImage<T extends { id: string; variantIndex: number; createdAt: string }>(
  images: T[],
  key: string,
): T | null {
  const byId = images.find((image) => image.id === key);
  if (byId) return byId;
  if (!isNumericKey(key)) return null;
  return images
    .filter((image) => image.variantIndex === Number(key))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/**
 * 결과 이미지를 돌려준다.
 *
 * 경로를 그대로 노출하지 않고 소유자를 확인한 뒤 읽는다 — 파일 저장소에는
 * RLS 가 없어 코드가 대신 막는다.
 *
 * **관리자는 남의 것도 본다.** 관리자 작업물 목록에서 무엇을 만들었는지 보고
 * 첫 화면에 걸 것을 고르는데, 목록은 나오면서 그림만 전부 비면 고를 수가
 * 없다. 넓히는 것은 보기뿐이다 — 고치기·지우기는 그대로 자기 것만이다.
 */
export async function GET(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id, index } = await context.params;
    /**
     * **둘 다 필요하다.**
     *
     * 누가 전체를 보는가는 `lib/access/core.ts` 가 정한다 — 목록과 상세가 다른
     * 답을 내면 「목록에는 뜨는데 안 열리는」 상태가 난다(2026-09-04).
     *
     * 그런데 **로컬에서는 그 답이 맞아도 쓸 수 없다.** 전체 조회는 Supabase 를
     * 직접 읽는데 로컬은 파일 시스템을 쓰고 환경변수가 비어 있다. 게다가
     * `dev-auth.ts:44` 가 로컬 사용자를 언제나 관리자로 주므로, 막지 않으면
     * **로컬에서 포스터 그림이 한 장도 안 보인다**(실측 500).
     */
    const found = usesAdminLookup(
      hasFullScope(viewerFrom(auth.member), "read"),
      isLocalStoreEnabled(),
    )
      ? await adminAssetPath(id, index)
      : pickImage(await posterStoresForUser(auth.member.userId).images.byProject(id), index);
    if (!found) return new Response("찾을 수 없습니다.", { status: 404 });

    /**
     * `?size=thumb` 이면 목록용 사본을 준다.
     *
     * **없으면 원본으로 떨어진다.** 이미 쌓인 결과에는 사본이 없고, 표에 자리가
     * 적혀 있는데 파일만 사라진 경우도 있다. 그때 404 를 내면 원본이 멀쩡한데도
     * 목록의 그림이 빈다.
     */
    const wantsThumb = new URL(request.url).searchParams.get("size") === "thumb";
    const read = async (storagePath: string) =>
      isLocalStoreEnabled()
        ? await readFile(path.join(localStoreRoot(), "poster", ...storagePath.split("/")))
        : await downloaded(storagePath);

    let bytes: Buffer | null = null;
    let servedThumb = false;
    if (wantsThumb && found.thumbPath) {
      // **한 줄 남긴다.** 경로 규칙이 어긋나거나 정책이 바뀌어 사본 읽기가 전량
      // 실패하면, 화면은 멀쩡히 뜨면서 전송량만 조용히 원래대로 돌아간다.
      bytes = await read(found.thumbPath).catch((error: unknown) => {
        console.error(`[poster] 사본을 못 읽어 원본으로 떨어집니다(${found.thumbPath}): ${error instanceof Error ? error.message : error}`);
        return null;
      });
      servedThumb = bytes !== null;
    }
    if (!bytes) bytes = await read(found.assetPath);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": servedThumb ? "image/webp" : "image/png",
        "cache-control": "private, max-age=60",
      },
    });
  } catch {
    return new Response("이미지를 읽지 못했습니다.", { status: 500 });
  }
}
