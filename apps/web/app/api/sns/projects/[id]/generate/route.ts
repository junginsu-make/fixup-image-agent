import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { isLocalStoreEnabled } from "../../../../../../lib/local-store";
import { snsFlowStoreForUser } from "../../../../../../lib/sns-flow-store";
import { generateLocalFlow } from "../../../local-fake-flow";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  if (!isLocalStoreEnabled()) {
    return Response.json({ ok: false, message: "실제 fal·검수 연결은 운영 배포 단계에서 설정합니다." }, { status: 501 });
  }
  try {
    const { id } = await context.params;
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(id);
    if (!project?.data.flow) return Response.json({ ok: false, message: "먼저 기획과 원고를 만들어 주세요." }, { status: 409 });
    const flow = await generateLocalFlow(project, project.data.flow);
    const saved = await store.save(id, flow, "ready");
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "카드 이미지를 만들지 못했습니다." }, { status: 500 });
  }
}
