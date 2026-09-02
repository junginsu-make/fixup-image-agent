import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { snsFlowStoreForUser } from "../../../../../../lib/sns-flow-store";
import { stopQueuedGeneration } from "../../../../../../lib/sns/queued-flow";
import { withSnsProjectLock } from "../../../../../../lib/sns/project-lock";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 만들던 것을 멈춘다.
 *
 * fal 에 이미 보낸 요청은 취소할 수 없다. 멈추는 것은 결과를 받아 오는
 * 일뿐이고, 보낸 요청의 비용은 그대로 나간다. 받아 둔 카드는 남는다.
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    return await withSnsProjectLock(id, async () => {
      const store = await snsFlowStoreForUser(auth.member.userId);
      const project = await store.get(id);
      if (!project?.data.flow) return Response.json({ ok: false, message: "생성 흐름을 찾을 수 없습니다." }, { status: 404 });
      const flow = stopQueuedGeneration(project.data.flow, new Date().toISOString());
      const saved = await store.save(id, flow, "ready");
      return Response.json({ ok: true, project: saved });
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "멈추지 못했습니다." },
      { status: 500 },
    );
  }
}
