import { reviewPoster, shouldReviewPoster } from "@fixup/poster-core";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterReviewProviders, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 고른 변형만 검수한다.
 *
 * 세 장을 다 검수하면 두 장 값은 버리는 셈이다. 자동으로 다시 만들지 않는다 —
 * 반려해도 이미지는 남고 사람이 누를 때까지 기다린다.
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });

    const images = await stores.images.byProject(id);
    const target = images.find(shouldReviewPoster);
    if (!target) {
      return Response.json(
        { ok: false, message: "먼저 변형 하나를 고르세요. 고른 것만 검수합니다." },
        { status: 400 },
      );
    }

    const providers = createPosterReviewProviders();
    const result = await reviewPoster(
      {
        slots: project.data.slots,
        imageUrl: `${new URL(_request.url).origin}/api/poster/projects/${id}/images/${target.variantIndex}/file`,
        preservedImageUrls: [],
      },
      providers.primary,
    );

    await stores.images.saveReview(target.id, result.review ?? { decision: "fail", summary: "검수하지 못했습니다.", issues: result.issues });
    return Response.json({
      ok: true,
      status: result.status,
      review: result.review,
      issues: result.issues,
      images: await stores.images.byProject(id),
    });
  } catch (error) {
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "검수하지 못했습니다." },
      { status: 500 },
    );
  }
}
