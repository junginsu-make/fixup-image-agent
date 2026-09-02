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
 * 결과 이미지를 돌려준다.
 *
 * 경로를 그대로 노출하지 않고 소유자를 확인한 뒤 읽는다 — 파일 저장소에는
 * RLS 가 없어 코드가 대신 막는다.
 */
export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id, index } = await context.params;
    const images = await posterStoresForUser(auth.member.userId).images.byProject(id);
    const target = images.find((image) => String(image.variantIndex) === index);
    if (!target) return new Response("찾을 수 없습니다.", { status: 404 });

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
