import { resolveGeminiKey } from "../../../../lib/server-keys";
import { authenticateApiMember } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compatibility endpoint: reports server configuration without calling Gemini. */
export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  return resolveGeminiKey()
    ? Response.json({ ok: true, provider: "server" })
    : Response.json({ ok: false, code: "API_KEY_MISSING", message: "운영자 Gemini 서버 키가 설정되지 않았습니다." }, { status: 503 });
}
