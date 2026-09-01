import { authenticateApiMember } from "../../../../lib/membership/api";
import { candidateServiceForUser } from "../../../../lib/repository-factory";
import { handleCandidatePatch } from "../candidate-handler";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  return handleCandidatePatch(request, id, await candidateServiceForUser(auth.member.userId));
}
