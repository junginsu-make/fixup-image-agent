import { savePosterResult } from "../../../../../../lib/poster/save-result";
import { useDurableGeneration, runForResource } from "../../../../../../lib/generation/run-store";
import { isTerminal, publicRun } from "../../../../../../lib/generation/types";
import { z } from "zod";
import { creditUnits } from "@fixup/shared";
import { authenticateApiMember, finalizeAiUsage } from "../../../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { collectPoster } from "../../../../../../lib/poster/flow";

/** 결과도 라이브러리 버킷에 둔다. 포스터만의 버킷을 따로 두지 않는다. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const StatusSchema = z.object({
  requestRowId: z.string(),
  falRequestId: z.string(),
  endpoint: z.string(),
  /**
   * **더 이상 쓰지 않는다.** 받기만 하고 버린다.
   *
   * 이 값은 브라우저가 정한다. 그대로 믿고 확정하던 동안에는 `0` 을 보내면
   * 크레딧이 한 장도 안 깎이고 관리자 비용 장부까지 0 달러가 됐다. 단가는
   * 이제 제출 때 서버가 적어 둔 요청 행에서 읽는다.
   *
   * `.strict()` 라 칸을 지우면 배포 중인 옛 화면이 400 을 받는다. 그래서
   * 자리만 남기고 값은 안 본다. 화면에서 이 칸이 사라진 뒤에 지운다.
   */
  unitCostUsd: z.number().optional(),
}).strict();

/**
 * fal 이 준 URL 을 우리 저장소로 옮긴다. 그 URL 은 오래 살지 않는다.
 *
 * 로컬은 디스크에, 운영은 라이브러리 버킷에 둔다. 경로 모양이 다르다 —
 * 버킷 정책이 경로 첫 칸으로 소유자를 판정하므로 운영 경로는 사용자로
 * 시작해야 한다. 어느 쪽이든 화면은 같은 주소로 읽는다.
 */
/**
 * 목록에 걸 사본을 만들어 둔다. 자리를 돌려주고, 못 만들면 `null` 이다.
 *
 * **사본 하나 때문에 결과물을 잃지 않는다.** 없으면 화면이 원본으로 떨어진다.
 */
/**
 * 상태를 물어보고, 끝났으면 회수한다.
 *
 * **상태 조회는 새 작업을 만들지 않는다.** 과금이 아니므로 화면이 주기적으로
 * 불러도 된다. 탭을 닫아도 request_id 가 장부에 남아 다시 열면 이어진다.
 */
export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (useDurableGeneration()) {
    const input = z.object({ runId: z.string().uuid() }).strict().safeParse(body);
    if (!input.success) return Response.json({ok:false,code:"reload_required",message:"화면을 새로고침한 뒤 실행 상태를 확인해 주세요."},{status:409});
    try {
      const { id } = await context.params;
      const run = await runForResource(auth.member.userId,"poster",id,input.data.runId);
      if (!run) return Response.json({ok:false,message:"생성 요청을 찾을 수 없습니다."},{status:404});
      const ok = !["failed","cancelled","needs_reconciliation"].includes(run.state);
      return Response.json({ok,done:isTerminal(run.state),run:publicRun(run),
        ...(!ok ? {message:run.state==="needs_reconciliation"?"생성 요청 상태를 확인 중입니다. 잠시 후 다시 확인해 주세요.":"이미지 생성을 완료하지 못했습니다."}:{}),
        images:await posterStoresForUser(auth.member.userId).images.byProject(id)});
    } catch { return Response.json({ok:false,message:"생성 상태를 확인하지 못했습니다."},{status:503}); }
  }
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, message: "조회할 요청을 알려 주세요." }, { status: 400 });
  }
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const fal = createPosterFalClients();

    const result = await collectPoster(
      {
        projectId: id,
        requestRowId: parsed.data.requestRowId,
        falRequestId: parsed.data.falRequestId,
        endpoint: parsed.data.endpoint,
      },
      {
        queue: fal.queue,
        requests: stores.requests,
        images: stores.images,
        saveImage: (projectId, generationRequestId, variantIndex, url) =>
          savePosterResult(auth.member.userId, projectId, generationRequestId, variantIndex, url),
      },
    );

    /**
     * **결과를 받았으면 그때 장부를 확정한다.**
     *
     * 예약은 만들기 요청이 「변형 N장」으로 잡아 뒀다. fal 이 덜 돌려주면 그만큼만
     * 받아야 하므로, 실제로 저장된 장수로 다시 센다.
     *
     * **열쇠를 지운다.** 남겨 두면 다음 만들기가 옛 열쇠로 확정해 두 번 깎이거나
     * 엉뚱한 요청을 닫는다.
     *
     * 확정이 실패해도 결과는 돌려준다 — 그림은 이미 저장됐고, 묶인 장은 예약이
     * 만료되면 풀린다. 여기서 막으면 사용자가 만든 그림을 못 본다.
     */
    if (result.done) {
      const project = await stores.projects.get(id);
      /**
       * **이번 회차만 센다.**
       *
       * 예전에는 `images.byProject(id)` 로 셌는데 그것은 프로젝트의 **모든**
       * 그림이다. `add` 는 옛 행을 지우지 않으므로, 두 번째 생성이 0장을
       * 돌려줘도 옛 그림 때문에 성공으로 확정되고 전액이 깎였다.
       */
      const savedCount = result.savedCount ?? 0;
      const unitUsd = result.unitCostUsd ?? 0;
      const reservationId = project?.data.reservationId;
      if (reservationId) {
        try {
          await finalizeAiUsage(
            { userId: auth.member.userId, requestId: reservationId },
            savedCount > 0,
            creditUnits(unitUsd * savedCount),
            undefined,
            /**
             * **원가를 함께 남긴다.**
             *
             * 그동안 포스터는 장부에 원가가 한 줄도 없었다 — 실제로 26장을
             * 만들었는데 `admin_cost_by_operation` 에는 포스터가 아예 안 나왔다.
             * 회원 차감(`consumed_units`)과 우리가 낸 돈은 다른 값이라,
             * 차감만 적으면 원가를 영영 알 수 없다.
             */
            { model: project?.modelId ?? "", billableImages: savedCount },
          );
        } catch {
          // 삼킨다. 사용자가 만든 그림을 못 보는 것이 더 나쁘다.
        }
      }
      await stores.projects.update(id, {
        status: "done",
        ...(project ? { data: { ...project.data, reservationId: undefined } } : {}),
      });
    }
    return Response.json({
      ok: true,
      done: result.done,
      images: await stores.images.byProject(id),
    });
  } catch (error) {
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "상태를 확인하지 못했습니다." },
      { status: 500 },
    );
  }
}
