import { logClientEvent } from "@fixup/redesign-core";
import { authenticateApiMember } from "../../../../lib/membership/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  return Response.json(logClientEvent(body));
}
