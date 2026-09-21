import { authenticateApiMember } from "../../../../../lib/membership/api";
import { createPdpJobRepository } from "../../../../../lib/pdp/jobs";
import { jobNotFound, jobView } from "../view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 만들어 둔 작업 하나를 되찾는다.
 *
 * 탭을 닫았다 돌아온 사용자가 여기서 결과를 찾는다. **조회는 아무것도 만들지
 * 않는다** — 저장소를 읽고 그림 주소를 서명할 뿐이라 돈이 안 든다(설계 §8.3).
 *
 * 남의 것이면 **404** 다. 「권한 없음」으로 답하면 그 id 가 있다는 사실을
 * 알려 주는 셈이 된다.
 *
 * **번호를 모르는 사용자**는 옆 문(`GET /api/pdp/jobs?documentId=`)으로
 * 들어온다. 답의 모양은 `view.ts` 한 곳에서 짓는다.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const job = await createPdpJobRepository().get(id, auth.member.userId);
  if (!job) return jobNotFound();

  return Response.json({ ok: true, job: await jobView(job) });
}
