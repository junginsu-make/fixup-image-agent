import { authenticateApiMember } from "../../../../lib/membership/api";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { handleCandidatePatch } from "../candidate-handler";
import { createCandidateService } from "../candidate-service";
import { createSupabaseCandidateRepository } from "../candidate-store";

type Context = { params: Promise<{ id: string }> };

async function service() {
  return createCandidateService(createSupabaseCandidateRepository(await createSupabaseServerClient()));
}

export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  return handleCandidatePatch(request, id, await service());
}
