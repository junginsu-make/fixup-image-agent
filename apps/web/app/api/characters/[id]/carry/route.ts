import { z } from "zod";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { CharacterCarryNotFound, carryCharacterViews } from "../../../../../lib/character-carry";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ fromId: z.string().min(1).max(100) });

/**
 * 「과정 보기」로 연 캐릭터에서 새로 만든 캐릭터(주소의 id)에 원본(`fromId`)의
 * 나머지 각도를 옮겨 담는다. 규칙은 `lib/character-carry.ts`.
 *
 * 그림을 그리지 않으므로 크레딧 예약이 없다.
 */
export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, message: "요청을 확인해 주세요." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const result = await carryCharacterViews({
      userId: auth.member.userId, fromId: parsed.data.fromId, toId: id,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CharacterCarryNotFound) {
      return Response.json({ ok: false, message: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[characters/:id/carry]", error);
    return Response.json({ ok: false, message: "각도를 옮겨 담지 못했습니다." }, { status: 500 });
  }
}
