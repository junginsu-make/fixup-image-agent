import { authenticateApiMember } from "../../../lib/membership/api";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createReferenceSetStore } from "./reference-set-store";
import { SetInputSchema } from "./schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function store() {
  return createReferenceSetStore(await createSupabaseServerClient());
}

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, sets: await (await store()).list() });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "참고 이미지 세트를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = SetInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "세트 입력을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const set = await (await store()).create(auth.member.userId, parsed.data);
    return Response.json({ ok: true, set }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "세트를 만들지 못했습니다." }, { status: 500 });
  }
}
