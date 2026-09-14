import { configurationHealth } from "../../../../lib/health";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const { ok } = configurationHealth();
  return Response.json({ ok, status: ok ? "ready" : "not_ready" }, {
    status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" },
  });
}
