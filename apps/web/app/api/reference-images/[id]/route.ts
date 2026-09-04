import { authenticateApiMember } from "../../../../lib/membership/api";
import {
  findLocalReferenceImage,
  getLocalDatabase,
  isLocalStoreEnabled,
  localStoreRoot,
  removeLocalReferenceFiles,
} from "../../../../lib/local-store";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { canModifyReferenceImage } from "../../../../lib/reference-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 참고 이미지를 지운다. **올린 사람만.**
 *
 * **행을 먼저 지우고 파일을 나중에 지운다.** 파일이 먼저 사라지면 목록에는
 * 남아 있는데 미리보기가 깨진 상태가 된다. 반대 순서면 파일만 남는데,
 * 그건 눈에 안 띄고 용량만 차지할 뿐이다.
 *
 * 목록이 회원 공용이 되면서 **소유자 확인을 코드에서 직접 한다.** 전에는
 * 남의 행이 애초에 안 보여 못 지웠다. 지금은 보이고, RLS 는 delete 를
 * 막되 "0 줄 지웠다"를 오류가 아닌 성공으로 돌려준다 — 그대로 두면 지운 줄
 * 알았는데 그대로인 상태가 된다.
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

    // 세트 항목은 FK cascade 가 지운다. RLS 는 마지막 방어선으로 남겨 두고,
    // 사용자에게 무슨 일이 일어났는지는 여기서 분명히 답한다.
    const supabase = await createSupabaseServerClient();
    const found = await supabase
      .from("reference_images")
      .select("user_id,storage_path")
      .eq("id", id)
      .maybeSingle();
    if (found.error) throw new Error(found.error.message);
    if (!found.data) return Response.json({ ok: false, message: "참고 이미지를 찾을 수 없습니다." }, { status: 404 });
    if (!canModifyReferenceImage(
      { userId: auth.member.userId, role: auth.member.profile.role },
      found.data.user_id as string,
    )) {
      return Response.json(
        { ok: false, message: "다른 회원이 올린 참고 이미지는 지울 수 없습니다." },
        { status: 403 },
      );
    }

    // 남의 것을 지우는 것은 **관리자 권한으로** 해야 한다. 세션 클라이언트로
    // 보내면 RLS 가 0줄로 막는데, supabase-js 는 그것을 오류로 주지 않는다 —
    // 화면에는 「지웠다」가 뜨고 실제로는 남는다. 누구 것인지는 위에서 이미
    // 가렸으므로, 여기까지 온 요청은 지워도 되는 것이다.
    const owned = found.data.user_id === auth.member.userId;
    const writer = owned ? supabase : createSupabaseAdminClient();
    const removed = await writer.from("reference_images").delete().eq("id", id);
    if (removed.error) throw new Error(removed.error.message);
    await writer.storage.from("library").remove([found.data.storage_path as string]);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "지우지 못했습니다." },
      { status: 500 },
    );
  }
}
