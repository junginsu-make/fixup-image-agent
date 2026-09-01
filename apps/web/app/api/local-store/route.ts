import { isLocalStoreEnabled } from "../../../lib/local-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, enabled: isLocalStoreEnabled() });
}
