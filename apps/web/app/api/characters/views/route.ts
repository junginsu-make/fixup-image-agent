import { z } from "zod";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";
import { regenerateAngle } from "../../../../lib/characters";
import { IMAGE_MODELS } from "@fixup/pdp-core";

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
  angle: z.enum(["left_45", "right_45", "left_90", "right_90", "back"]),
  aspectRatio: z.enum(["1:1", "3:4", "4:3", "9:16", "16:9"]).default("3:4"),
  modelId: z.enum(IMAGE_MODELS.map((model) => model.id) as [string, ...string[]]).optional(),
});

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "다시 만들 각도를 알려 주세요." },
      { status: 400 },
    );
  }

  // 한 장이다.
  const reservation = await reserveAiUsage(req, "pdp_image", 1);
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
      result.ok ? 1 : 0,
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
