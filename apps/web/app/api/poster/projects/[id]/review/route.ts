import { reviewPoster, shouldReviewPoster } from "@fixup/poster-core";
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../../../lib/membership/credit-ledger";
import { llmSettleCost, withLlmMeter } from "../../../../../../lib/llm/meter";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, createPosterReviewProviders, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { posterImageBytes } from "../../../../../../lib/poster/asset-bytes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 고른 변형만 검수한다.
 *
 * 세 장을 다 검수하면 두 장 값은 버리는 셈이다. 자동으로 다시 만들지 않는다 —
 * 반려해도 이미지는 남고 사람이 누를 때까지 기다린다.
 *
 * **예약을 먼저 거친다**(설계 2026-09-30 §3.1). `poster_image` + `poster:{id}:review`,
 * 0 크레딧이다. 크레딧이 없거나 운영자가 멈췄으면 fal 에 올리기 전에 막힌다.
 */
export async function POST(request: Request, context: Context) {
  // 검수 모델에 쓴 돈을 잰다. 정산에 싣는다.
  return withLlmMeter(() => review(request, context));
}

async function review(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  /** `catch` 에서도 닫아야 하므로 밖에 둔다. */
  let reservation: { userId: string; requestId: string } | null = null;
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });

    /*
     * **본인 그림만.** 검수는 fal 에 올리고 검수 모델을 부르는, 돈이 드는 길이다.
     * 그림 읽기는 팀이면 팀원 것까지 열려 있고 결과 저장은 본인 것만 돼서, 팀원의
     * 작업을 검수하면 모델 값을 낸 뒤에야 막혔다(2026-09-29 리뷰). 이름표도 필요 없다.
     */
    const images = await stores.images.byProject(id, { lineage: false, ownOnly: true });
    const target = images.find(shouldReviewPoster);
    if (!target) {
      return Response.json(
        { ok: false, message: "먼저 변형 하나를 고르세요. 고른 것만 검수합니다." },
        { status: 400 },
      );
    }

    const reserved = await reserveAiUsage(request, "poster_image", 0, freeCreditPlan(`poster:${id}:review`));
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    const { bytes, contentType } = await posterImageBytes(target.assetPath);
    const reviewImageUrl = await createPosterFalClients().uploader.uploadReference(bytes, contentType);

    const providers = createPosterReviewProviders();
    const result = await reviewPoster(
      {
        slots: project.data.slots,
        // 검수 모델도 이 서버 밖에 있다. 우리 주소를 주면 401 을 받아 그림
        // 없이 판단하게 된다. 만들 때와 같이 바이트를 올려서 넘긴다.
        imageUrl: reviewImageUrl,
        preservedImageUrls: [],
      },
      providers.primary,
    );

    await stores.images.saveReview(target.id, result.review ?? { decision: "fail", summary: "검수하지 못했습니다.", issues: result.issues });
    const refreshed = await stores.images.byProject(id);
    await settleAiUsage(reservation, true, 0, undefined, llmSettleCost());
    return Response.json({
      ok: true,
      status: result.status,
      review: result.review,
      issues: result.issues,
      images: refreshed,
    });
  } catch (error) {
    // 실패해도 닫는다. 안 닫으면 예약이 만료까지 남는다.
    if (reservation) await settleAiUsage(reservation, false, 0, "poster_review_failed", llmSettleCost());
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "검수하지 못했습니다." },
      { status: 500 },
    );
  }
}
