import { authenticateApiMember } from "../../../../lib/membership/api";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createCandidateService } from "../candidate-service";
import { createSupabaseCandidateRepository } from "../candidate-store";
import { CandidatePatchSchema } from "../schema";

type Context = { params: Promise<{ id: string }> };

async function service() {
  return createCandidateService(createSupabaseCandidateRepository(await createSupabaseServerClient()));
}

export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = CandidatePatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "후보 상태를 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const { id } = await context.params;
    const candidate = await (await service()).updateStatus(id, parsed.data.status);
    return Response.json({ ok: true, candidate });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "후보 상태를 바꾸지 못했습니다." }, { status: 500 });
  }
}
