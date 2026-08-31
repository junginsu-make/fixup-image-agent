import { authenticateApiMember } from "../../../../lib/membership/api";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createReferenceSetStore } from "../reference-set-store";
import { SetInputSchema } from "../schema";

type Context = { params: Promise<{ id: string }> };

async function store() {
  return createReferenceSetStore(await createSupabaseServerClient());
}

export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = SetInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "세트 입력을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const { id } = await context.params;
    return Response.json({ ok: true, set: await (await store()).update(id, parsed.data) });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "세트를 수정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    await (await store()).remove(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "세트를 삭제하지 못했습니다." }, { status: 500 });
  }
}
