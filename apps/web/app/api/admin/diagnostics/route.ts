import { authenticateApiAdmin } from "../../../../lib/membership/api";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { configurationHealth } from "../../../../lib/health";
import { generationRuntime, generationRuntimeStatus } from "../../../../lib/generation/runtime";
import { withExecutionDeadline } from "../../../../lib/generation/deadline";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;
  try {
    return await withExecutionDeadline(Date.now() + 30000, false, async () => {
      const admin = createSupabaseAdminClient();
      const [generation, unresolved, oldest] = await Promise.all([
        generationRuntime().then(generationRuntimeStatus),
        admin.from("generation_runs").select("id", { count: "exact", head: true }).eq("state", "needs_reconciliation"),
        admin.from("generation_runs").select("created_at").not("state", "in", "(succeeded,failed,cancelled)").order("created_at").limit(1),
      ]);
      if (unresolved.error || oldest.error) throw new Error("diagnostics_unavailable");
      return Response.json({ configuration: configurationHealth(), generation, unresolved: unresolved.count, oldestRunAt: oldest.data?.[0]?.created_at ?? null }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch {
    return Response.json({ ok: false, code: "diagnostics_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
