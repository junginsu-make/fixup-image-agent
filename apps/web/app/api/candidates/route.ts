import { disabledRouteResponse } from "../../../lib/access/disabled-api";
import { authenticateApiMember } from "../../../lib/membership/api";
import { candidateServiceForUser } from "../../../lib/repository-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // 꺼 둔 화면의 API 다. 미들웨어는 `/api/` 를 등록부보다 먼저 통과시킨다.
  const disabled = disabledRouteResponse("/inbox");
  if (disabled) return disabled;

  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, candidates: await (await candidateServiceForUser(auth.member.userId)).list() });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "수집함을 불러오지 못했습니다." }, { status: 500 });
  }
}
