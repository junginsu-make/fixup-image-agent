import { z } from "zod";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { restoreCharacterReferences } from "../../../../../lib/characters";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 각도는 여섯이다. 더 오면 화면이 아닌 곳에서 온 것이다. */
const Body = z.object({ angles: z.array(z.string().min(1).max(40)).min(1).max(6) });

/**
 * 캐릭터 각도의 **라이브러리 사본을 다시 채운다**(2026-10-07).
 *
 * 카드뉴스·이미지 만들기에서 캐릭터를 불러올 때 라이브러리에 없는 각도가 있으면
 * 화면이 부른다. 규칙은 `restoreCharacterReferences`. 그림을 새로 그리지 않으므로
 * 크레딧 예약이 없다.
 */
export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, message: "다시 채울 각도를 알려 주세요." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const result = await restoreCharacterReferences(auth.member.userId, id, parsed.data.angles);
    if (!result) return Response.json({ ok: false, message: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    // 원문은 기록에만 남긴다. 화면에 저장소 구조가 나가면 안 된다.
    console.error("[characters/:id/library]", error);
    return Response.json({ ok: false, message: "라이브러리에 다시 넣지 못했습니다." }, { status: 500 });
  }
}
