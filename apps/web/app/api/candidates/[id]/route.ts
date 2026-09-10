import { disabledRouteResponse } from "../../../../lib/access/disabled-api";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { candidateServiceForUser } from "../../../../lib/repository-factory";
import { handleCandidatePatch } from "../candidate-handler";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  // 꺼 둔 화면의 API 다. 미들웨어는 `/api/` 를 등록부보다 먼저 통과시킨다.
  const disabled = disabledRouteResponse("/inbox");
  if (disabled) return disabled;

  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  return handleCandidatePatch(request, id, await candidateServiceForUser(auth.member.userId));
}
