import { authenticateApiAdmin } from "../../../../../../../lib/membership/api";
import { copyWorkToSelf } from "../../../store";

type Context = { params: Promise<{ kind: string; id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 남의 작업을 **내 것으로 복사한다.** 관리자만.
 *
 * **본문을 읽지 않는다.** 소유자는 세션에서만 온다 — 읽으면 언젠가 그 값이
 * 소유자로 쓰이고, 그때 남의 이름으로 작업이 생긴다.
 *
 * 관문은 읽기와 같다(`../route.ts`). **읽을 수 있는 것만 복사할 수 있다.**
 * 그리고 관문이 조회보다 먼저라, 관리자가 아니면 어떤 id 에도 답이 같다.
 *
 * 고치는 대신 복사하는 까닭은 `copyWorkToSelf` 머리말에 적어 두었다 —
 * 회원용 쓰기 경로를 넓히지 않으려는 것이다.
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;

  const { kind, id } = await context.params;
  if (kind !== "sns" && kind !== "poster") {
    return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const copied = await copyWorkToSelf(kind, id, auth.member.userId);
    return Response.json({ ok: true, id: copied.id });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "복사하지 못했습니다." },
      { status: 500 },
    );
  }
}
