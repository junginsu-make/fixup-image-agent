import { beginPosterRun, replayPosterRun } from "../../../../../../lib/generation/poster-execution";
import { isDurableGenerationEnabled, generationFailureResponse } from "../../../../../../lib/generation/run-store";
import { assertProjectWrite, projectWriteDeniedResponse } from "../../../../../../lib/generation/ownership";
import { canEdit, estimatePosterCost, planEditJob } from "@fixup/poster-core";
import { editSourceSize } from "./edit-source-size";
import { z } from "zod";
import { creditUnits } from "@fixup/shared";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { PosterChargedError, submitPoster } from "../../../../../../lib/poster/flow";
import { posterImageBytes } from "../../../../../../lib/poster/asset-bytes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const EditSchema = z.object({
  instruction: z.string().trim().min(1, "무엇을 고칠지 적어 주세요."),
  /** 다른 비율로 다시 만들 때만 준다. */
  ratioId: z.string().optional(),
}).strict();

/**
 * 고른 변형을 기준으로 고친다.
 *
 * **처음부터 다시 만들지 않는다.** 고른 이미지를 레퍼런스로 넣어야 애써 고른
 * 것이 유지된다. 수정은 한 장만 만든다 — 세 장을 또 받으면 고르는 일이 반복된다.
 */
export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  /** `catch` 에서도 봐야 한다 — 제출이 실패하면 묶인 장을 돌려줘야 한다. */
  let reservation: { userId: string; requestId: string } | null = null;
  const parsed = EditSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "수정 지시를 확인해 주세요." },
      { status: 400 },
    );
  }
  try {
    const { id } = await context.params;
    await assertProjectWrite(auth.member.userId, "poster", id);
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });
    if (isDurableGenerationEnabled()) { const replay = await replayPosterRun(request, auth.member.userId, project, parsed.data); if (replay) return replay; }

    const images = await stores.images.byProject(id);
    if (!canEdit(images)) {
      return Response.json(
        { ok: false, message: "먼저 고칠 변형 하나를 고르세요." },
        { status: 400 },
      );
    }
    const parent = images.find((image) => image.selected)!;

    /**
     * 고친 기준이 될 그림을 **fal 에 올려서** 넘긴다.
     *
     * 전에는 `/api/poster/.../file` 주소를 그대로 넘겼다. 그 길은 회원
     * 확인을 거치는데 fal 에는 로그인 쿠키가 없다 — 401 이 떨어지고, fal 은
     * 기준 그림 없이 일을 붙들고 있어 화면에는 「고치는 중」만 계속 떴다
     * (2026-09-04 사용자 보고). 첫 생성은 처음부터 바이트를 올리고 있었다.
     */
    const { bytes, contentType } = await posterImageBytes(parent.assetPath);
    const fal = createPosterFalClients();
    const parentUrl = await fal.uploader.uploadReference(bytes, contentType);

    // 화면이 수정하면서 비율을 바꿀 수 있으므로 **정해진 뒤의** 값을 본다.
    const ratioId = parsed.data.ratioId ?? project.ratio;
    const job = planEditJob({
      projectId: id,
      parentImageId: parent.id,
      parentUrl,
      instruction: parsed.data.instruction,
      modelId: project.modelId,
      ratioId,
      // `match-source` 작업은 크기를 안 넘기면 거절된다(설계 §10 3-b).
      sourceSize: editSourceSize(ratioId, project.data.adMaster, parent),
      slots: project.data.slots,
    });

    /**
     * **수정도 돈이다.**
     *
     * 이 길에는 예약도 확정도 없었다. 「이 장만 고치기」를 열 번 누르면 fal
     * 호출 열 번이 실제로 과금되는데 `generation_events` 에는 한 줄도 안 남고
     * 개인 한도·팀 크레딧에서도 전혀 안 빠졌다. 만들기와 같은 순서를 따른다.
     *
     * 수정은 언제나 한 장이다(설계 §「세 장을 또 받지 않는다」).
     */
    const estimate = estimatePosterCost({
      modelId: project.modelId,
      ratioId,
      variants: 1,
      // 고친 기준 그림을 늘 레퍼런스로 넣는다 — i2i 단가다.
      hasReferences: true,
    });
    if (isDurableGenerationEnabled()) return await beginPosterRun(request, auth.member.userId, project, job, parsed.data);
    const reserved = await reserveAiUsage(request, "poster_image", creditUnits(estimate.totalUsd ?? 0));
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    const submission = await submitPoster(job, {
      queue: fal.queue, requests: stores.requests, images: stores.images, // 제출만 하는 길이라 저장이 일어나지 않는다. 빈 값을 돌려주면 언젠가
        // 불렸을 때 `asset_path: ""` 가 조용히 들어가므로, 시끄럽게 실패한다.
        saveImage: async () => { throw new Error("제출 경로에서는 결과를 저장하지 않습니다."); },
    });

    /**
     * **예약 열쇠를 작업에 적어 둔다.**
     *
     * 확정은 `status` 가 결과를 받은 뒤에 한다 — 만들기와 같은 길이다. 화면도
     * 수정 뒤에 같은 `status` 를 물어보므로 거기서 마무리된다.
     */
    await stores.projects.update(id, {
      data: { ...project.data, reservationId: reserved.requestId },
    });
    return Response.json({ ok: true, submission });
  } catch (error) {
    const generationFailure = generationFailureResponse(error);
    if (generationFailure) return generationFailure;
    const writeDenied = projectWriteDeniedResponse(error);
    if (writeDenied) return writeDenied;
    /**
     * **묶어 둔 장을 돌려준다.** 제출이 실패했으면 돈이 안 나갔다. 안 풀면
     * 만료될 때까지 그 사람 한도에서 빠져 있는다.
     *
     * 과금 뒤의 실패(`PosterChargedError`)는 돈이 이미 나갔으므로 풀지 않는다.
     * 그때는 예약이 만료되며 정리된다 — 사람이 찾을 수 있게 자국만 남긴다.
     */
    if (reservation) {
      if (error instanceof PosterChargedError) {
        console.error(`[poster] 수정: 돈은 나갔는데 장부에 못 적었습니다: fal=${error.falRequestId}`);
      } else {
        try { await finalizeAiUsage(reservation, false, 0, "poster_edit_failed"); } catch { /* 아래 원인이 우선이다 */ }
      }
    }
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "고치지 못했습니다." },
      { status: 400 },
    );
  }
}
