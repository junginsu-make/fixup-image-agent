import { readFile } from "node:fs/promises";
import path from "node:path";
import { authenticateApiMember } from "../../../../../../../../lib/membership/api";
import { isLocalStoreEnabled, localStoreRoot } from "../../../../../../../../lib/local-store";
import { posterStoresForUser } from "../../../../../../../../lib/poster/stores";
import { createSupabaseAdminClient } from "../../../../../../../../lib/supabase/admin";

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
async function adminAssetPath(projectId: string, index: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient()
    .from("poster_images")
    .select("asset_path")
    .eq("project_id", projectId)
    .eq("variant_index", Number(index))
    .maybeSingle();
  return (data?.asset_path as string | undefined) ?? null;
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
export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id, index } = await context.params;
    const isAdmin = auth.member.profile.role === "admin";
    const assetPath = isAdmin
      ? await adminAssetPath(id, index)
      : (await posterStoresForUser(auth.member.userId).images.byProject(id))
          .find((image) => String(image.variantIndex) === index)?.assetPath ?? null;
    if (!assetPath) return new Response("찾을 수 없습니다.", { status: 404 });
    const target = { assetPath };

    const bytes = isLocalStoreEnabled()
      ? await readFile(path.join(localStoreRoot(), "poster", ...target.assetPath.split("/")))
      : await downloaded(target.assetPath);
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "image/png", "cache-control": "private, max-age=60" },
    });
  } catch {
    return new Response("이미지를 읽지 못했습니다.", { status: 500 });
  }
}
