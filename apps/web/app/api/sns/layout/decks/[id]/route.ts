import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { deleteDeck } from "../../../../../../lib/layout/deck-store";
import { snsFailure } from "../../../failure";

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
    return snsFailure("세트 지우기", error, "세트를 지우지 못했습니다.", 500);
  }
}
