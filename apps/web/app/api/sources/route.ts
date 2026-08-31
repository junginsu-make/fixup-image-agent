import { authenticateApiMember } from "../../../lib/membership/api";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { SourceInputSchema } from "./schema";
import { createSourceService } from "./source-service";
import { createSupabaseSourceRepository } from "./source-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function service() {
  return createSourceService(createSupabaseSourceRepository(await createSupabaseServerClient()));
}

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, sources: await (await service()).list() });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "소스를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = SourceInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "소스 입력을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const source = await (await service()).create(auth.member.userId, parsed.data);
    return Response.json({ ok: true, source }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "소스를 등록하지 못했습니다." }, { status: 500 });
  }
}
