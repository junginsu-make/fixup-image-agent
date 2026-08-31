import { getServerConfig } from "@fixup/redesign-core";
import { authenticateApiMember } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const config = await getServerConfig();
  return Response.json({
    serverOpenaiKeyConfigured: config.serverOpenaiKeyConfigured,
    serverGoogleKeyConfigured: config.serverGoogleKeyConfigured,
    knowledgeConfigured: config.knowledgeConfigured,
    knowledgeDocuments: config.knowledgeDocuments,
    knowledgeChunks: config.knowledgeChunks,
    canManageKnowledge: auth.member.profile.role === "admin",
  });
}
