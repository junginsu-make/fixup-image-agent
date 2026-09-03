import { z } from "zod";
import { SlotListSchema, validateTemplate } from "@fixup/layout-core";
import { CARD_RATIOS } from "@fixup/sns-core";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { renderPreviewCard } from "../../../../../lib/layout/preview-service";
import { RenderBusyError, withRenderSlot } from "../../../../../lib/layout/render-gate";
import { PreviewCopySchema } from "../schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  ratio: z.string().trim().min(1).max(20),
  modelId: z.string().trim().min(1).max(60).default("gpt-image-2"),
  slots: SlotListSchema,
  copy: PreviewCopySchema,
});

/**
 * 카드 한 장을 그려 본다.
 *
 * 그림 칸은 회색 상자로 둔다. 여기서 fal 을 부르지 않는다. 대신 **부를
 * 횟수와 값**을 같이 돌려준다 — 그림 칸이 둘이면 두 번 부르고 비용도 두 배다.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = InputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: "뼈대를 확인해 주세요.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ratio = CARD_RATIOS.find((entry) => entry.id === parsed.data.ratio);
  if (!ratio) {
    return Response.json({ ok: false, message: `지원하지 않는 비율입니다: ${parsed.data.ratio}` }, { status: 400 });
  }

  const problems = validateTemplate({ id: "preview", name: "미리보기", role: "body", slots: parsed.data.slots })
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  if (problems.length) {
    return Response.json({ ok: false, message: problems.join(" "), issues: problems }, { status: 400 });
  }

  try {
    // 그리기는 CPU 를 실제로 쓴다. 한 번에 몇 개까지만 돌린다.
    const card = await withRenderSlot(auth.member.userId, () => renderPreviewCard({
      userId: auth.member.userId,
      size: ratio.pixel,
      slots: parsed.data.slots,
      copy: { index: 1, ...parsed.data.copy },
      modelId: parsed.data.modelId,
    }));

    return Response.json({
      ok: true,
      image: card.image,
      size: ratio.pixel,
      warnings: card.warnings,
      estimate: { calls: card.slots.length, totalUsd: card.unitUsd, slots: card.slots },
    });
  } catch (error) {
    if (error instanceof RenderBusyError) {
      return Response.json({ ok: false, message: error.message }, { status: error.status });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "미리보기를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
