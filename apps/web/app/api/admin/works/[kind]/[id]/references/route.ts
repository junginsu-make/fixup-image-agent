import { authenticateApiAdmin } from "../../../../../../../lib/membership/api";
import { copyReferencesToSelf, readAnyWork } from "../../../store";
import { referenceIdsOfWork } from "../../../copy-paths";

type Context = { params: Promise<{ kind: string; id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 다른 회원의 작업이 붙였던 그림을 **내 라이브러리로 복사한다.** 관리자만.
 *
 * 관리자가 다른 회원의 작업에서 지난 단계로 가면 02 가 비었다 — 그림이 그
 * 회원 것이라 관리자 목록에 없었다(2026-09-16 운영 데이터로 확인). 관리자는
 * 모든 작업이 작동해야 한다(사용자 결정).
 *
 * **본문을 읽지 않는다.** 복사할 그림은 **작업이 실제로 가리키는 것**만이다.
 * 화면이 보낸 id 를 받으면, 관리자 권한으로 아무 회원의 아무 그림이나 복사하는
 * 길이 열린다. 소유자도 세션에서만 온다.
 *
 * **관문이 조회보다 먼저다** — 형제 라우트(`../route.ts`)와 같다.
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;

  const { kind, id } = await context.params;
  if (kind !== "sns" && kind !== "poster") {
    return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const work = await readAnyWork(kind, id);
    if (!work) return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });

    const ids = referenceIdsOfWork(kind, (work as { data?: unknown }).data);
    const copies = await copyReferencesToSelf(ids, auth.member.userId);
    return Response.json({ ok: true, copies });
  } catch (error) {
    // DB 오류 문구를 화면에 흘리지 않는다. 서버 로그에 남긴다.
    console.error("[admin-works:references]", error);
    return Response.json({ ok: false, message: "그림을 가져오지 못했습니다." }, { status: 500 });
  }
}
