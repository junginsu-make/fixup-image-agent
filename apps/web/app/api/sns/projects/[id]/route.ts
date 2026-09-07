import { authenticateApiMember } from "../../../../../lib/membership/api";
import { hasFullScope, viewerFrom } from "../../../../../lib/access/core";
import { deleteAnyWork } from "../../../admin/works/store";
import { snsFlowStoreForUser } from "../../../../../lib/sns-flow-store";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 카드뉴스 작업을 지운다.
 *
 * 작업과 카드, 만들어 둔 그림까지 함께 지운다. 비용 기록만 남는다 —
 * 작업을 지웠다고 돈이 안 나간 것이 되지 않는다.
 */
export async function DELETE(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    // 관리자는 누구 것이든 지운다. 회원용 길을 넓히지 않고 따로 부른다 —
    // 같은 함수에 조건을 심으면 언젠가 그 조건이 어긋나 회원이 남의 작업을
    // 지운다. 되돌릴 수 없는 일이라 실수의 값이 너무 크다.
    const removed = hasFullScope(viewerFrom(auth.member), "delete")
      ? await deleteAnyWork("sns", id)
      : await (await snsFlowStoreForUser(auth.member.userId)).remove(id);
    if (!removed) return Response.json({ ok: false, message: "작업을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "작업을 지우지 못했습니다." },
      { status: 500 },
    );
  }
}
