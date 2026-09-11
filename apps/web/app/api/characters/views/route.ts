import { z } from "zod";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";
import { creditUnits } from "@fixup/shared";
import { imageCreditUnits, maxImageUnitUsd } from "../../../../lib/credit-cost";
import { regenerateAngle } from "../../../../lib/characters";
import { CHARACTER_SHEET, IMAGE_MODELS } from "@fixup/pdp-core";
import { durableCharacterView } from "../../../../lib/generation/character-operation";
import { boundedJson } from "../../../../lib/generation/request-body";
import { useDurableGeneration as durableGenerationEnabled } from "../../../../lib/generation/run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 각도 한 장만 다시 만든다.
 *
 * 전에는 마음에 안 드는 각도를 고칠 방법이 없어 캐릭터를 통째로 다시
 * 만들어야 했다. 빠진 각도를 채울 방법도 없었다 — 운영에 있는 캐릭터 하나가
 * 실제로 3장뿐이다.
 *
 * **정면은 못 만든다.** 정면은 고른 후보 그 자체이고, 그것이 나머지 세 각도의
 * 기준이다. 정면을 새로 만들면 나머지가 전부 남남이 된다.
 */

const BodySchema = z.object({
  characterId: z.string().min(1),
  // 정면은 없다. 고른 후보 그 자체이고 나머지의 기준이라 새로 만들면 전부 남남이 된다.
  // 다각도 한 장은 각도가 아니지만 만드는 길은 같다 — 정면을 참조로 한 장을 만든다.
  angle: z.enum(["left_45", "right_45", "left_90", "right_90", "back", CHARACTER_SHEET.id]),
  aspectRatio: z.enum(["1:1", "3:4", "4:3", "9:16", "16:9"]).default("3:4"),
  modelId: z.enum(IMAGE_MODELS.map((model) => model.id) as [string, ...string[]]).optional(),
});
export type ViewBody = z.infer<typeof BodySchema>;

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = BodySchema.safeParse(await boundedJson(req).catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "다시 만들 각도를 알려 주세요." },
      { status: 400 },
    );
  }
  if(durableGenerationEnabled())return durableCharacterView(req,auth.member.userId,parsed.data);

  /**
   * 한 장이다. **다만 모델마다 값이 다르다**(2026-09-08 사용자 결정).
   *
   * 전에는 무엇을 고르든 1장이었다 — nano-banana($0.039)나 GPT Image 2($0.219)나
   * 같은 1장이라, 비싼 모델을 쓰는 쪽이 5배 덜 냈다.
   */
  const reserved = parsed.data.modelId
    ? imageCreditUnits(parsed.data.modelId, 1)
    // 결이 모델을 정하므로 예약 시점에는 모른다. 비싸게 잡고 아래에서 확정한다.
    : creditUnits(maxImageUnitUsd());
  const reservation = await reserveAiUsage(req, "pdp_image", reserved);
  if (!reservation.ok) return reservation.response;

  try {
    const result = await regenerateAngle({
      userId: auth.member.userId,
      characterId: parsed.data.characterId,
      angle: parsed.data.angle,
      aspectRatio: parsed.data.aspectRatio,
      modelId: parsed.data.modelId as never,
    });

    const usage = await finalizeAiUsage(
      reservation,
      result.ok,
      // **실제로 쓴 모델로 확정한다.** 예약은 비싸게 잡아 둔 것이다.
      result.ok ? imageCreditUnits(result.model, 1) : 0,
      result.ok ? undefined : "character_angle_failed",
      result.ok ? { model: result.model, billableImages: 1 } : undefined,
    );

    return Response.json({ ...result, usage }, { status: result.ok ? 200 : 500 });
  } catch (error) {
    await finalizeAiUsage(reservation, false, 0, "character_angle_failed");
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "다시 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
