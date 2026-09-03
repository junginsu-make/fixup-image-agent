import { authenticateApiMember } from "../../../../../lib/membership/api";
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
    const removed = await (await snsFlowStoreForUser(auth.member.userId)).remove(id);
    if (!removed) return Response.json({ ok: false, message: "작업을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "작업을 지우지 못했습니다." },
      { status: 500 },
    );
  }
}
