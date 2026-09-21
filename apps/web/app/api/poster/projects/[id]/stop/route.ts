import { authenticateApiMember, finalizeAiUsage } from "../../../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 만들던 것을 멈춘다.
 *
 * fal 에 이미 보낸 요청은 취소할 수 없다. 멈추는 것은 **결과를 받아 오는
 * 일**이고, 보낸 요청의 값은 그대로 나갈 수 있다. 카드뉴스가 같은 이유로 같은
 * 주소를 갖고 있다(`api/sns/projects/[id]/stop`).
 *
 * **여기서 장부를 닫는다.** 포스터의 확정은 `status` 폴링 안에만 있었는데,
 * 멈추면 아무도 안 캐묻는다. 그러면 예약한 장이 만료(10분)까지 그 사람 한도를
 * 묶고, 그동안 다시 만들려 해도 자리가 없다(2026-09-17 독립 리뷰).
 *
 * **받은 것이 없으므로 0장으로 닫는다.** 멈춘 시점에는 우리 저장소에 이번
 * 회차의 그림이 아직 없다 — 그림은 「다 됐다」를 받은 그 순간에 저장된다.
 * 우리가 fal 에 낸 값은 응답을 못 받아 알 수 없고, 모르는 값을 장부에 적으면
 * 그게 더 나쁜 거짓말이다. 화면이 「값이 나갈 수 있습니다」라고 미리 말한다.
 *
 * 상태를 `ready` 로 되돌린다. `generating` 인 채로 두면 다시 만들기가 1분
 * 동안 막힌다(`generate/route.ts` 의 `RESUBMIT_WINDOW_MS`).
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "작업을 찾지 못했습니다." }, { status: 404 });

    const reservationId = project.data.reservationId;
    if (reservationId) {
      try {
        await finalizeAiUsage(
          { userId: auth.member.userId, requestId: reservationId },
          false,
          0,
          "poster_stopped",
        );
      } catch {
        // 삼킨다. 예약은 만료로도 풀린다 — 여기서 터지면 멈추지도 못한다.
      }
    }

    // 주인만 고칠 수 있다(`projects.update` 가 `user_id` 로 건다).
    const saved = await stores.projects.update(id, {
      status: "ready",
      data: { ...project.data, reservationId: undefined },
    });
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "멈추지 못했습니다." },
      { status: 500 },
    );
  }
}
