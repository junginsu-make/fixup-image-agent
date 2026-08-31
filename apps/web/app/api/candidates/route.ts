import { authenticateApiMember } from "../../../lib/membership/api";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createCandidateService } from "./candidate-service";
import { createSupabaseCandidateRepository } from "./candidate-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function service() {
  return createCandidateService(createSupabaseCandidateRepository(await createSupabaseServerClient()));
}

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, candidates: await (await service()).list() });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "수집함을 불러오지 못했습니다." }, { status: 500 });
  }
}
