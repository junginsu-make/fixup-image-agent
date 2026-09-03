import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { deleteDeck } from "../../../../../../lib/layout/deck-store";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    await deleteDeck(auth.member.userId, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "세트를 지우지 못했습니다." },
      { status: 500 },
    );
  }
}
