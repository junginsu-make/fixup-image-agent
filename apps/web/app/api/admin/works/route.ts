import { authenticateApiAdmin } from "../../../../lib/membership/api";
import { listAllWorks } from "./store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 모든 회원의 작업물. **관리자만.**
 *
 * 회원용 목록과 주소를 나눈 이유는 하나다. 한 주소에서 물음표 하나로
 * 「전부」와 「내 것」이 갈리면, 언젠가 그 조건이 어긋나 남의 작업이 회원에게
 * 새 나간다. 아예 다른 문으로 둔다.
 *
 * 회원용 목록과 **같은 모양**으로 준다 — 화면이 변환을 두 벌 갖지 않게.
 * 다만 각 줄에 만든 사람과 `mine` 이 붙는다.
 */
export async function GET() {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;
  try {
    const works = await listAllWorks(auth.member.userId);
    return Response.json({ ok: true, ...works });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "작업물을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
