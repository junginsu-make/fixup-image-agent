import { createPdpLlmOrNull } from "../../../../lib/pdp/providers";
import { authenticateApiMember } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  return Response.json({ serverKeyConfigured: Boolean(createPdpLlmOrNull()) });
}
