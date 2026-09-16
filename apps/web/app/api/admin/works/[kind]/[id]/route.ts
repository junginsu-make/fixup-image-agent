import { authenticateApiAdmin } from "../../../../../../lib/membership/api";
import { readAnyWork } from "../../store";

type Context = { params: Promise<{ kind: string; id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 작업 한 건. **관리자만.**
 *
 * 라이브러리 목록은 관리자에게 남의 작업까지 보여 주는데(`../../route.ts`),
 * 눌러서 여는 단계별 화면은 회원용 경로라 RLS 를 탄다. `same_team` 에 관리자
 * 예외가 없어(`supabase/migrations/202609070003_team_rls.sql:43`) 남의 작업은
 * 404 였다 — **보이는데 못 여는** 상태였다.
 *
 * **관문이 조회보다 먼저다.** 관리자가 아니면 id 를 보기도 전에 403 으로
 * 끝나므로, 어떤 id 를 넣어도 답이 같다 — 존재 여부가 새지 않는다.
 * 관리자에게만 「없다(404)」와 「있다(200)」가 갈린다.
 *
 * 회원용 목록과 주소를 나눈 까닭은 형제 라우트에 적어 두었다 — 한 주소에서
 * 물음표 하나로 갈리면 언젠가 그 조건이 어긋나 남의 작업이 새 나간다.
 */
export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;

  const { kind, id } = await context.params;
  if (kind !== "sns" && kind !== "poster") {
    return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const work = await readAnyWork(kind, id);
    if (!work) return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
    return Response.json({ ok: true, work });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
