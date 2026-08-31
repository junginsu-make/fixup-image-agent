import { authenticateApiMember } from "../../../../lib/membership/api";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { SourcePatchSchema } from "../schema";
import { createSourceService } from "../source-service";
import { createSupabaseSourceRepository } from "../source-store";

type Context = { params: Promise<{ id: string }> };

async function service() {
  return createSourceService(createSupabaseSourceRepository(await createSupabaseServerClient()));
}

export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = SourcePatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "바꿀 값을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const { id } = await context.params;
    return Response.json({ ok: true, source: await (await service()).update(id, parsed.data) });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "소스를 수정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    await (await service()).remove(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "소스를 삭제하지 못했습니다." }, { status: 500 });
  }
}
