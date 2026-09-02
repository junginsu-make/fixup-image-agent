import { authenticateApiMember } from "../../../../lib/membership/api";
import {
  findLocalReferenceImage,
  getLocalDatabase,
  isLocalStoreEnabled,
  localStoreRoot,
  removeLocalReferenceFiles,
} from "../../../../lib/local-store";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 참고 이미지를 지운다.
 *
 * **행을 먼저 지우고 파일을 나중에 지운다.** 파일이 먼저 사라지면 목록에는
 * 남아 있는데 미리보기가 깨진 상태가 된다. 반대 순서면 파일만 남는데,
 * 그건 눈에 안 띄고 용량만 차지할 뿐이다.
 */
export async function DELETE(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;

    if (isLocalStoreEnabled()) {
      const database = getLocalDatabase();
      const image = await findLocalReferenceImage(database, auth.member.userId, id);
      if (!image) return Response.json({ ok: false, message: "참고 이미지를 찾을 수 없습니다." }, { status: 404 });
      await database.update((data) => {
        const index = data.referenceImages.findIndex(
          (row) => row.id === id && row.userId === auth.member.userId,
        );
        if (index >= 0) data.referenceImages.splice(index, 1);
        // 세트에서도 빼 준다. 남겨 두면 없는 그림을 가리키는 항목이 생긴다.
        for (const set of data.referenceSets) {
          set.items = set.items.filter((item) => item.referenceImageId !== id);
        }
      });
      await removeLocalReferenceFiles(localStoreRoot(), [image.storagePath]);
      return Response.json({ ok: true });
    }

    // 운영에서는 RLS 가 남의 것을 막는다. 세트 항목은 FK cascade 가 지운다.
    const supabase = await createSupabaseServerClient();
    const found = await supabase.from("reference_images").select("storage_path").eq("id", id).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    if (!found.data) return Response.json({ ok: false, message: "참고 이미지를 찾을 수 없습니다." }, { status: 404 });

    const removed = await supabase.from("reference_images").delete().eq("id", id);
    if (removed.error) throw new Error(removed.error.message);
    await supabase.storage.from("library").remove([found.data.storage_path as string]);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "지우지 못했습니다." },
      { status: 500 },
    );
  }
}
