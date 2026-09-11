import { runLlmOperation } from "../../../../../../lib/generation/llm-operation";
import { generationFailureResponse } from "../../../../../../lib/generation/run-store";
import { snsModelSnapshot } from "../../../../../../lib/sns/providers";
import { assertProjectWrite, projectWriteDeniedResponse } from "../../../../../../lib/generation/ownership";
import { reviewPoster, shouldReviewPoster } from "@fixup/poster-core";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
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
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    await assertProjectWrite(auth.member.userId, "poster", id);
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

    const { bytes, contentType } = await posterImageBytes(target.assetPath);
    const reviewImageUrl = await createPosterFalClients().uploader.uploadReference(bytes, contentType);

    const providers = createPosterReviewProviders();
    const result = await runLlmOperation(_request, auth.member.userId, {operation:"poster_review",resourceType:"poster",resourceId:id,identity:{imageId:target.id,slots:project.data.slots},models:Object.values(snsModelSnapshot()),maxCalls:1,isSuccess:value=>Boolean(value.review)}, () => reviewPoster(
      {
        slots: project.data.slots,
        // 검수 모델도 이 서버 밖에 있다. 우리 주소를 주면 401 을 받아 그림
        // 없이 판단하게 된다. 만들 때와 같이 바이트를 올려서 넘긴다.
        imageUrl: reviewImageUrl,
        preservedImageUrls: [],
      },
      providers.primary,
    ));

    await stores.images.saveReview(target.id, result.review ?? { decision: "fail", summary: "검수하지 못했습니다.", issues: result.issues });
    return Response.json({
      ok: true,
      status: result.status,
      review: result.review,
      issues: result.issues,
      images: await stores.images.byProject(id),
    });
  } catch (error) {
    const limited = generationFailureResponse(error);
    if (limited) return limited;
    const writeDenied = projectWriteDeniedResponse(error);
    if (writeDenied) return writeDenied;
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "검수하지 못했습니다." },
      { status: 500 },
    );
  }
}
