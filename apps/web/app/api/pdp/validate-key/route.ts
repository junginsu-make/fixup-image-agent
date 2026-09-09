import { createPdpLlmOrNull } from "../../../../lib/pdp/providers";
import { authenticateApiMember } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 호환용. 실제 모델을 부르지 않고 서버 설정만 알린다. */
export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  return createPdpLlmOrNull()
    ? Response.json({ ok: true, provider: "server" })
    : Response.json({ ok: false, code: "API_KEY_MISSING", message: "운영자 AI 서버 키가 설정되지 않았습니다." }, { status: 503 });
}
