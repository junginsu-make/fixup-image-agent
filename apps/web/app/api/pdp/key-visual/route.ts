import { pdpCreditSize } from "../../../../lib/membership/image-sizes";
import { creditImagePlan, markCreditStarted } from "../../../../lib/membership/credit-ledger";
import {
  DEFAULT_IMAGE_MODEL,
  generateKeyVisual,
  textPlanDepsFrom,
  toPdpErrorResponse,
  mapPdpErrorCodeToStatus,
} from "@fixup/pdp-core";
import type { KeyVisualRequest } from "@fixup/pdp-core";
import { createPdpProviders } from "../../../../lib/pdp/providers";
import { finalizeAiUsage, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { imageCreditUnits } from "../../../../lib/credit-cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 섹션 이미지들의 색·조명·질감을 묶는 대표 이미지 1장.
 *
 * **섹션 이미지와 같은 셈을 쓴다** — `imageCreditUnits(model, 1)`. 전에는
 * 예약도 확정도 `1` 로 박아 두고 「섹션 이미지와 동일하게 1 크레딧」이라고
 * 적어 두었는데, 정작 섹션 이미지는 모델 단가로 환산한다(`pdp/images`).
 * 그래서 비싼 모델일수록 이 한 장만 덜 깎였다(2026-09-22 발견).
 *
 * 재생성은 새 x-idempotency-key 로 다시 호출하며 그때마다 같은 만큼 든다.
 *
 * **여기에는 근거 게이트(rejectIfUnverified)를 붙이지 않는다.** 빠뜨린 것이 아니다 —
 * buildKeyVisualPrompt 는 브리프와 style_guide 만 읽고 headline·subheadline·bullets·
 * prompt_ko 를 쓰지 않아, 미확인 예시 값이 이 이미지로 구워질 경로가 없다.
 * 키비주얼 프롬프트가 섹션 카피를 읽기 시작하면 그때는 게이트가 필요하다.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as KeyVisualRequest | null;
  if (!body) return Response.json({ ok: false, message: "Invalid request" }, { status: 400 });
  const model = body.imageModel ?? DEFAULT_IMAGE_MODEL;
  const units = imageCreditUnits(model, 1);
  const reservation = await reserveAiUsage(req, "pdp_image", units, creditImagePlan(1, pdpCreditSize(model, body.aspectRatio), "pdp:key-visual"));
  if (!reservation.ok) return reservation.response;

  try {
    await markCreditStarted(reservation);
    const { imageBase64, mimeType } = await generateKeyVisual(body, textPlanDepsFrom(createPdpProviders()));
    // 섹션 이미지와 똑같이 fal 에서 한 장을 만든다. 모델을 안 남기면 이 한 장은
    // 비용 집계에서 0원으로 사라진다.
    // 장부가 안 닫혀도 그림은 돌려준다. 포스터·카드뉴스와 같은 판단이다.
    const usage = await settleAiUsage(reservation, true, units, undefined, {
      model,
      billableImages: 1, deliveredImages: 1, completionConfirmed: true,
    });
    return Response.json({ ok: true, imageBase64, mimeType, usage });
  } catch (err) {
    const envelope = toPdpErrorResponse(err);
    await finalizeAiUsage(reservation, false, 0, String(envelope.code || "key_visual_failed"));
    return Response.json(envelope, { status: mapPdpErrorCodeToStatus(envelope.code) });
  }
}
