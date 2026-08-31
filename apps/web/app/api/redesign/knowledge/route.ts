import { knowledgeStats, indexKnowledge, deleteKnowledge, RedesignError } from "@fixup/redesign-core";
import { authenticateApiAdmin, authenticateApiMember } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try { return Response.json(await knowledgeStats()); }
  catch (err) { return Response.json({ configured: true, error: err instanceof Error ? err.message : "지식파일 상태 확인 실패" }, { status: 500 }); }
}

export async function POST(req: Request) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    return Response.json(await indexKnowledge({ name: String(body.name || "knowledge-file"), text: String(body.text || ""), kind: body.kind ? String(body.kind) : undefined, adminKey: process.env.KNOWLEDGE_ADMIN_KEY || "" }));
  } catch (err) {
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: err instanceof Error ? err.message : "지식파일 인덱싱 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    return Response.json(await deleteKnowledge({ documentId: String(body.documentId || ""), adminKey: process.env.KNOWLEDGE_ADMIN_KEY || "" }));
  } catch (err) {
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: err instanceof Error ? err.message : "지식파일 삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
