import { assertProjectWrite, projectWriteDeniedResponse } from "../../../../../../lib/generation/ownership";
import { useDurableGeneration, runForResource, stopRun } from "../../../../../../lib/generation/run-store";
import { publicRun } from "../../../../../../lib/generation/types";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { snsFlowStoreForUser, snsWriteDenied } from "../../../../../../lib/sns-flow-store";
import { stopQueuedGeneration } from "../../../../../../lib/sns/queued-flow";
import { settleSnsReservation } from "../../../../../../lib/sns/settle";
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
  try {
    const { id } = await context.params;
    await assertProjectWrite(auth.member.userId, "sns", id);
    return await withSnsProjectLock(id, async () => {
      const store = await snsFlowStoreForUser(auth.member.userId);
      const project = await store.get(id);
      if (!project?.data.flow) return Response.json({ ok: false, message: "생성 흐름을 찾을 수 없습니다." }, { status: 404 });
      if (useDurableGeneration()) {
        const run = await runForResource(auth.member.userId,"sns",id);
        if (!run) return Response.json({ok:false,message:"진행 중인 생성을 찾지 못했습니다."},{status:404});
        const stopped = await stopRun(auth.member.userId,run.id);
        return Response.json({ok:true,project,run:publicRun(stopped),message:"중지를 요청했습니다. 이미 제출한 결과는 확인 후 마무리합니다."});
      }
      const flow = stopQueuedGeneration(project.data.flow, new Date().toISOString());
      /**
       * **여기서 장부를 닫는다.**
       *
       * 멈추면 흐름이 끝난다. 그런데 확정은 `status` 폴링 안에만 있었고, 그
       * 라우트는 「도는 중이 아니다」로 곧장 빠져나가므로 여기서 끝난 예약은
       * 영영 안 풀렸다 — 만료까지 크레딧을 묶고, 이미 나간 fal 값은 장부에
       * 안 실렸다. 받아 둔 카드만큼은 받고 나머지는 돌려준다.
       */
      const settled = await settleSnsReservation(auth.member.userId, flow, project.modelId);
      const saved = await store.save(id, settled, "ready");
      return Response.json({ ok: true, project: saved });
    });
  } catch (error) {
    const writeDenied = projectWriteDeniedResponse(error);
    if (writeDenied) return writeDenied;
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "멈추지 못했습니다." },
      { status: 500 },
    );
  }
}
