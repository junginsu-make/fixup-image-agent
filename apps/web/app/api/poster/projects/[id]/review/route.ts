import { reviewPoster, shouldReviewPoster } from "@fixup/poster-core";
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../../../lib/membership/credit-ledger";
import { llmSettleCost, withLlmMeter } from "../../../../../../lib/llm/meter";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, createPosterReviewProviders, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { posterImageBytes } from "../../../../../../lib/poster/asset-bytes";
import { errorLogText } from "../../../../../../lib/easy/log-text";
import { FalPoolBusyError, FalPoolUnavailableError } from "../../../../../../lib/fal/pool/router";

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
      { review: (input) => maskProviderError("검수", () => providers.primary.review(input)) },
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
    return reviewFailure(error);
  }
}

const REVIEW_FAILED = "검수하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
const PROVIDER_FAILED = "응답을 받지 못했습니다.";

/**
 * **검수 모델이 던진 원문을 우리 문장으로 바꿔 다시 던진다**(2026-10-07 후속 Task 12b, 기획 라우트와 같은 규칙).
 *
 * 패키지의 `withIssueFallback` 은 던진 글을 그대로 「주 검수 실패: <원문>」으로 적고, 그 목록이 성공
 * 응답과 저장한 검수로 「다양하게」 화면에 뜬다. 원문은 서버 기록에만 남긴다. **여전히 던진다** —
 * 패키지가 실패로 다루는 것은 전과 같다. 값은 원래 호출 안에서 잰다. 응답 모양 검사(패키지 안의
 * 스키마)가 던지는 글은 이 자리 밖이라 가리지 못한다.
 */
async function maskProviderError<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    console.error(`[poster] ${what} 호출 실패`, errorLogText(error));
    throw new Error(PROVIDER_FAILED);
  }
}

/**
 * **실패를 화면에 어떻게 말할지**(2026-10-07 후속 Task 12, 고치기의 `editFailure` 와 같은 규칙).
 *
 * 전에는 모든 예외를 원문으로 돌려줘 저장소 · fal 글과 환경변수 이름이 「다양하게」 화면에 떴다.
 * 우리가 쓴 문장은 fal 계정 풀의 두 문장뿐이라 그것만 그대로 보인다(원문은 풀이 기록에만 남겼다).
 * 검수 모델의 실패는 안에서 잡혀 `issues` 로 온다. 나머지는 일반 문장이고 원문은 서버 기록에만
 * 남긴다. **상태 코드는 전과 같다**(500, 설정 오류만 503).
 */
function reviewFailure(error: unknown): Response {
  if (error instanceof FalPoolBusyError || error instanceof FalPoolUnavailableError) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }
  console.error("[poster] 검수 실패", errorLogText(error));
  const status = error instanceof PosterProviderConfigurationError ? 503 : 500;
  return Response.json({ ok: false, message: REVIEW_FAILED }, { status });
}
