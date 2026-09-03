import { z } from "zod";
import {
  DECK_ROLE_LABEL,
  LayoutDeckSchema,
  deckCards,
  deckEstimate,
  validateDeck,
  type DeckRole,
} from "@fixup/layout-core";
import { CARD_RATIOS } from "@fixup/sns-core";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { renderPreviewCard } from "../../../../../lib/layout/preview-service";
import { RenderBusyError, withRenderSlot } from "../../../../../lib/layout/render-gate";
import { PreviewCopySchema } from "../schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  deck: LayoutDeckSchema,
  modelId: z.string().trim().min(1).max(60).default("gpt-image-2"),
  copy: PreviewCopySchema,
});

const ROLES = Object.keys(DECK_ROLE_LABEL) as DeckRole[];

/**
 * 세트 한 벌을 그려 본다 — 표지 1장 · 속지 N장 · 엔딩 1장.
 *
 * **자리마다 한 번씩만 그린다.** 속지 넉 장은 같은 틀에 같은 원고라 결과가
 * 글자 하나까지 같다. 네 번 그리면 시간만 네 배로 쓴다. 화면이 같은 그림을
 * 네 번 늘어놓아 「이 세트로 만들면 이렇게 나온다」를 보여 준다.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = InputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: "세트를 확인해 주세요.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { deck, modelId, copy } = parsed.data;
  const ratio = CARD_RATIOS.find((entry) => entry.id === deck.ratio);
  if (!ratio) {
    return Response.json({ ok: false, message: `지원하지 않는 비율입니다: ${deck.ratio}` }, { status: 400 });
  }

  const problems = validateDeck(deck)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  if (problems.length) {
    return Response.json({ ok: false, message: problems.join(" "), issues: problems }, { status: 400 });
  }

  try {
    // 자리 셋을 한 자리 안에서 그린다. 세 번 따로 잡으면 상한이 무의미하다.
    const frames = await withRenderSlot(auth.member.userId, async () => {
      const drawn: Record<string, { image: string; warnings: string[] }> = {};
      for (const role of ROLES) {
        const card = await renderPreviewCard({
          userId: auth.member.userId,
          size: ratio.pixel,
          slots: deck.frames[role],
          copy: { index: 1, ...copy },
          modelId,
        });
        // 자리 이름을 붙여야 어느 틀에서 난 경고인지 알 수 있다.
        drawn[role] = {
          image: card.image,
          warnings: card.warnings.map((warning) => `${DECK_ROLE_LABEL[role]} · ${warning}`),
        };
      }
      return drawn;
    });

    return Response.json({
      ok: true,
      size: ratio.pixel,
      cards: deckCards(deck.total).cards,
      frames,
      estimate: deckEstimate(deck, ratio.pixel, modelId),
    });
  } catch (error) {
    if (error instanceof RenderBusyError) {
      return Response.json({ ok: false, message: error.message }, { status: error.status });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "세트를 그려 보지 못했습니다." },
      { status: 500 },
    );
  }
}
