import { transcribeStrips, humanizeProviderError, RedesignError } from "@fixup/redesign-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { authenticateApiMember } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const result = await transcribeStrips({
        strips: Array.isArray(body?.strips) ? body.strips : [],
        batchIndex: Number(body?.batchIndex ?? 0),
        batchCount: Number(body?.batchCount ?? 1),
        previousSectionHint: body?.previousSectionHint ? String(body.previousSectionHint) : undefined,
        provider: String(body?.provider || "openai"),
        openaiKey: resolveOpenaiKey(),
        googleKey: resolveGoogleKey(),
        signal: controller.signal,
      });
      return Response.json(result);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeProviderError(err.message) : "전사 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
