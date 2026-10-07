import { writeCaption } from "@fixup/sns-core";
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../../../lib/membership/credit-ledger";
import { llmSettleCost, withLlmMeter } from "../../../../../../lib/llm/meter";
import { snsFlowStoreForUser, snsWriteDenied } from "../../../../../../lib/sns-flow-store";
import { createSnsPlanningProviders, SnsProviderConfigurationError } from "../../../../../../lib/sns/providers";
import { snsFailure } from "../../../failure";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 인스타그램에 붙일 게시글 문구를 쓴다.
 *
 * 카드가 다 나온 뒤에 부른다. 원고를 고치면 다시 부르면 된다 — 자동으로
 * 따라가게 만들면 고칠 때마다 모델을 부르게 되고, 그만큼 돈이 나간다.
 *
 * **예약을 먼저 거친다**(설계 2026-09-30 §3.1). `sns_image` + `sns:{id}:caption`,
 * 0 크레딧이다. 크레딧이 없거나 운영자가 멈췄으면 여기서 막힌다.
 */
export async function POST(request: Request, context: Context) {
  return withLlmMeter(() => caption(request, context));
}

async function caption(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  let reservation: { userId: string; requestId: string } | null = null;
  try {
    const { id } = await context.params;
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(id);
    if (!project?.data.flow) return Response.json({ ok: false, message: "결과를 찾을 수 없습니다." }, { status: 404 });

    const reserved = await reserveAiUsage(request, "sns_image", 0, freeCreditPlan(`sns:${id}:caption`));
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    const providers = createSnsPlanningProviders();
    const result = await writeCaption(
      {
        title: project.title,
        cards: project.data.flow.cards.map((card) => card.copy),
        toneNote: project.toneNote,
        language: project.language,
      },
      providers.captionPrimary,
      providers.captionBackup,
    );

    const flow = { ...project.data.flow, caption: result.caption, captionIssues: result.issues };
    const saved = await store.save(id, flow, project.status);
    await settleAiUsage(reservation, true, 0, undefined, llmSettleCost());
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    if (reservation) await settleAiUsage(reservation, false, 0, "sns_caption_failed", llmSettleCost());
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    // 설정 오류는 503 을 지키되 환경변수 이름은 서버 기록에만 남긴다.
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return snsFailure("게시글 문구", error, "게시글 문구를 만들지 못했습니다.", status);
  }
}
