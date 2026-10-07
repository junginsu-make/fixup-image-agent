import { knownPosterCreditSize } from "../../../../../../lib/membership/image-sizes";
import { creditImagePlan, markCreditStarted, bindCreditJob } from "../../../../../../lib/membership/credit-ledger";
import { buildPosterEditJob, estimatePosterCost, planEditJob } from "@fixup/poster-core";
import { editSourceSize } from "./edit-source-size";
import { editAttachmentInputs, withAddedAttachments } from "./edit-attachments";
import { z } from "zod";
import { creditUnits } from "@fixup/shared";
import { chooseModelForRatio, IMAGE_MODELS } from "@fixup/sns-core";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../../../lib/membership/api";
import { withLlmMeter } from "../../../../../../lib/llm/meter";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { PosterChargedError, submitPoster } from "../../../../../../lib/poster/flow";
import { posterImageBytes, referenceBytes } from "../../../../../../lib/poster/asset-bytes";
import { posterReferencesByIds } from "../../../../../../lib/poster/references";
import { uploadUniqueReferences } from "../../../../../../lib/fal/upload";
import { teamIdOf } from "../../../../../../lib/teams/store";
import { errorLogText } from "../../../../../../lib/easy/log-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const EditSchema = z.object({
  instruction: z.string().trim().min(1, "무엇을 고칠지 적어 주세요."),
  /** 다른 비율로 다시 만들 때만 준다. */
  ratioId: z.string().optional(),
  /**
   * **고칠 그림.** 화면이 직접 말한다. 안 보내는 옛 화면은 골라 둔 그림을 고친다.
   *
   * 전에는 서버가 그때 「골라져 있는」 그림을 고쳤다. 화면의 고르기가 실패하거나
   * 늦게 닿으면 **다른 변형이 고쳐졌다**(2026-09-29 점검).
   */
  imageId: z.string().trim().min(1).max(64).optional(),
  /**
   * **고치면서 새로 붙인 사진**(라이브러리 참고 이미지 id). 「쉽게」가 보낸다
   * (2026-10-06 — 「로고를 이 사진의 로고로 바꿔줘」). 포스터 화면은 안 보낸다.
   */
  addedReferenceIds: z.array(z.string().trim().min(1).max(64)).max(8, "한 번에 8장까지 붙일 수 있습니다.").optional(),
}).strict();

/**
 * 고른 변형을 기준으로 고친다.
 *
 * **처음부터 다시 만들지 않는다.** 고른 이미지를 레퍼런스로 넣어야 애써 고른
 * 것이 유지된다. 수정은 한 장만 만든다 — 세 장을 또 받으면 고르는 일이 반복된다.
 */
export async function POST(request: Request, context: Context) {
  return withLlmMeter(() => handlePost(request, context));
}

async function handlePost(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  /** `catch` 에서도 봐야 한다 — 제출이 실패하면 묶인 장을 돌려줘야 한다. */
  let reservation: { userId: string; requestId: string } | null = null;
  /** 조립이 거절한 우리 문장. `submitPoster` 가 이 글로 던진다 — `catch` 가 원문과 가른다. */
  let rejected: string | undefined;
  const parsed = EditSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "수정 지시를 확인해 주세요." },
      { status: 400 },
    );
  }
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });

    /*
     * 이름표는 필요 없다 — 요청 장부를 안 읽는다.
     *
     * **본인 그림만.** 작업·그림 읽기는 팀이면 팀원 것까지 열려 있는데 작업 저장은
     * 본인 것만 된다. 팀원 작업을 고치면 fal 에 돈을 낸 **뒤에** 저장에서 막혔다.
     * 여기서 본인 것만 보면 돈이 나가기 전에 「고칠 그림을 찾을 수 없다」로 멈춘다.
     */
    const images = await stores.images.byProject(id, { lineage: false, ownOnly: true });
    const wanted = parsed.data.imageId;
    // 이 작업의 그림 안에서만 찾는다 — 남의 그림 id 가 와도 여기서 끝난다.
    const parent = wanted
      ? images.find((image) => image.id === wanted)
      : images.find((image) => image.selected);
    if (!parent) {
      return wanted
        ? Response.json({ ok: false, message: "고칠 그림을 찾을 수 없습니다." }, { status: 404 })
        : Response.json({ ok: false, message: "먼저 고칠 변형 하나를 고르세요." }, { status: 400 });
    }

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

    /**
     * **원래 작업의 지킬 대상(제품·인물 원본 사진)도 다시 올린다.**
     *
     * 고칠 그림 속 제품·인물은 이미 한 번 그려진 것이라, 그것만 보고 고치면 고칠
     * 때마다 조금씩 달라진다. 따라 만들 그림은 안 올린다 — 그 결은 고칠 그림에
     * 이미 있고, 붙이면 「느낌만 따라 하라」가 다시 따라온다(`edit-job.ts`).
     *
     * 읽는 규칙은 만들기와 같다(2026-09-17 라이브러리 규칙 통일). 지킬 것이 없는
     * 작업은 팀 조회부터 건너뛴다.
     */
    const preservedIds = project.data.preservedIds ?? [];
    const preserved = preservedIds.length
      ? await posterReferencesByIds({
        userId: auth.member.userId,
        role: auth.member.profile.role,
        teamId: await teamIdOf(auth.member.userId),
      }, preservedIds)
      : [];
    const preservedUrlById = await uploadUniqueReferences(
      preserved,
      (reference) => reference.id,
      async (reference) => {
        /*
         * **한 장을 못 올려도 고치기는 간다.** 원본 사진은 알아보게 돕는 보조고
         * 대상은 고칠 그림에 이미 있다. 라이브러리 행은 있는데 파일이 사라진 경우
         * 여기서 던지면, 사진 없이도 되던 고치기가 통째로 막힌다(2026-09-29 리뷰).
         * 빈 주소는 `editAttachmentInputs` 가 거른다.
         */
        try {
          const file = await referenceBytes(reference.storagePath);
          return await fal.uploader.uploadReference(file.bytes, file.contentType);
        } catch (error) {
          console.error(
            `[poster] 고치기: 원본 사진을 못 올려 빼고 갑니다(${reference.id}): `
            + `${error instanceof Error ? error.message : error}`,
          );
          return "";
        }
      },
    );

    /*
     * **새로 붙인 사진**(「쉽게」, 2026-10-06). 원본 사진과 달리 **조용히 빼지 않는다**
     * — 사용자가 방금 붙인 것이 이번 고치기의 핵심이라, 빼고 고치면 값만 나가고
     * 바라는 것은 안 나온다. 그래서 하나라도 못 찾거나 못 올리면 **예약 전에** 멈춘다.
     */
    const addedIds = [...new Set(parsed.data.addedReferenceIds ?? [])];
    const added = addedIds.length
      ? await posterReferencesByIds({
        userId: auth.member.userId,
        role: auth.member.profile.role,
        teamId: await teamIdOf(auth.member.userId),
      }, addedIds)
      : [];
    if (added.length !== addedIds.length) {
      return Response.json({ ok: false, message: "붙인 사진을 찾을 수 없습니다." }, { status: 404 });
    }
    const addedUrls = await Promise.all(added.map(async (reference) => {
      const file = await referenceBytes(reference.storagePath);
      return fal.uploader.uploadReference(file.bytes, file.contentType);
    })).catch((error) => {
      console.error(`[poster] 고치기: 붙인 사진을 올리지 못했습니다: ${error instanceof Error ? error.message : error}`);
      return null;
    });
    if (!addedUrls) {
      return Response.json({ ok: false, message: "붙인 사진을 읽지 못했습니다. 다시 붙여 주세요." }, { status: 400 });
    }

    // 화면이 수정하면서 비율을 바꿀 수 있으므로 **정해진 뒤의** 값을 본다.
    const ratioId = parsed.data.ratioId ?? project.ratio;
    /*
     * **부모 그림을 만든 모델로 고친다.** 그 모델은 부모 요청 줄에 적혀 있다
     * (`requests.modelOf`). 처음 만들기는 고른 모델이 그 비율을 못 만들면 바꾸고
     * 바꾼 것을 작업에 적지 않아서, 작업의 모델을 쓰면 「만들 수 없는 조합」으로
     * 거절되거나 모델 목록 차례가 바뀐 뒤(09-10 무렵)의 옛 작업은 부모와 다른
     * 모델로 고쳐졌다(2026-09-29 리뷰·점검).
     *
     * 그 모델이 이 비율을 못 만들면(비율을 바꿔 고칠 때) 처음 만들기와 같은 규칙
     * (`chooseModelForRatio`)으로 바꾼다. 부모 모델을 모르면(옛 기록) 작업의 모델이다.
     */
    const parentModelId = await stores.requests.modelOf(parent.generationRequestId).catch(() => null);
    const modelId = chooseModelForRatio(ratioId, parentModelId ?? project.modelId, IMAGE_MODELS).model.id;
    /*
     * **새로 붙인 사진은 잘리게 두지 않는다**(2026-10-06 독립 리뷰). 고치기 조립은 한도를
     * 넘으면 뒤에서 자르는데(`edit-job.ts`), 새것은 이번 고치기의 핵심이라 잘리면 값만
     * 나간다. 고칠 그림이 한 칸을 쓴다. 원래 작업의 원본 사진은 잘려도 된다 — 보조다.
     */
    const room = (IMAGE_MODELS.find((model) => model.id === modelId)?.maxReferenceImages ?? Infinity) - 1;
    if (addedUrls.length > room) {
      return Response.json(
        { ok: false, message: `이 이미지를 만든 모델은 고칠 때 사진을 ${room}장까지 받습니다. 붙인 사진을 줄여 주세요.` },
        { status: 400 },
      );
    }
    const job = planEditJob({
      projectId: id,
      parentImageId: parent.id,
      parentUrl,
      instruction: parsed.data.instruction,
      modelId,
      ratioId,
      // `match-source` 작업은 크기를 안 넘기면 거절된다(설계 §10 3-b).
      sourceSize: editSourceSize(ratioId, project.data.adMaster, parent),
      slots: project.data.slots,
      ...withAddedAttachments(editAttachmentInputs(project.data, preserved, preservedUrlById), addedUrls),
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
      modelId,
      ratioId,
      variants: 1,
      // 고친 기준 그림을 늘 레퍼런스로 넣는다 — i2i 단가다.
      hasReferences: true,
      // 실제 요청과 같은 크기로 값을 낸다. 안 넘기면 원본 비율 작업이 자리표시
      // 픽셀로 계산돼, 예약한 장수가 실제 값보다 적었다(9장 → 5장, 2026-09-29).
      sourceSize: job.sourceSize,
    });
    const reserved = await reserveAiUsage(request, "poster_image", creditUnits(estimate.totalUsd ?? 0), creditImagePlan(1, knownPosterCreditSize(modelId, ratioId, job.sourceSize), `poster:${id}`));
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    await markCreditStarted(reservation);
    const submission = await submitPoster(job, {
      queue: fal.queue, requests: stores.requests, images: stores.images, // 제출만 하는 길이라 저장이 일어나지 않는다. 빈 값을 돌려주면 언젠가
        // 불렸을 때 `asset_path: ""` 가 조용히 들어가므로, 시끄럽게 실패한다.
        saveImage: async () => { throw new Error("제출 경로에서는 결과를 저장하지 않습니다."); },
    },
    // **고치기 조립을 넘긴다.** 안 넘기면 처음 만들기 조립을 타서 지시가 묻히고
    // 고칠 그림이 「느낌만 따라 할 참고」가 된다(2026-09-29 사용자 보고).
    (editJob) => {
      const built = buildPosterEditJob(editJob);
      rejected = built.rejected;
      return built;
    });

    /**
     * **예약 열쇠를 작업에 적어 둔다.**
     *
     * 확정은 `status` 가 결과를 받은 뒤에 한다 — 만들기와 같은 길이다. 화면도
     * 수정 뒤에 같은 `status` 를 물어보므로 거기서 마무리된다.
     */
    await bindCreditJob(reservation, { key: `poster:${submission.requestRowId}`, resource: `poster:${id}`, providerId: submission.falRequestId, endpoint: submission.endpoint });
    await stores.projects.update(id, {
      data: { ...project.data, reservationId: reserved.requestId },
    });
    return Response.json({ ok: true, submission });
  } catch (error) {
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
    return editFailure(error, rejected);
  }
}

const EDIT_FAILED = "고치지 못했습니다. 잠시 뒤 다시 시도해 주세요.";

/**
 * **실패를 화면에 어떻게 말할지**(2026-10-07 후속 Task 7).
 *
 * 전에는 모든 예외를 400 + 원문으로 돌려줬다. Supabase · 저장소 · fal 의 날것 글(표 이름 ·
 * 서명한 주소)이 「다양하게」 화면에 떴고, 쉽게 모드는 400 을 안 가려 거기서도 떴다.
 *
 * 우리가 쓴 문장 둘만 400 그대로 보인다 — 조립 거절(사진 장수 · 크기 등, 사용자가 고칠 수
 * 있다)과 과금 뒤 실패(「다시 해 보세요」로 덮으면 두 번째 작업을 만든다 — `flow.ts`).
 * 나머지는 일반 문장 500 이다. 쉽게 모드는 5xx 를 한 번 더 가린다. 설정 오류는 503 을
 * 지키되 환경변수 이름은 서버 기록에만 남긴다.
 */
function editFailure(error: unknown, rejected: string | undefined): Response {
  if (error instanceof PosterChargedError || (rejected && error instanceof Error && error.message === rejected)) {
    return Response.json({ ok: false, message: error.message }, { status: 400 });
  }
  console.error("[poster] 고치기 실패", errorLogText(error));
  const status = error instanceof PosterProviderConfigurationError ? 503 : 500;
  return Response.json({ ok: false, message: EDIT_FAILED }, { status });
}
