import { z } from "zod";
import { LayoutDeckSchema, SlotListSchema, validateDeck, validateTemplate } from "@fixup/layout-core";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { snsFlowStoreForUser } from "../../../../../lib/sns-flow-store";
import { hasActiveQueuedGeneration } from "../../../../../lib/sns/queued-flow";
import {
  applyCardLayout,
  applyDeck,
  clearCardLayout,
  clearLayout,
} from "../../../../../lib/layout/apply-deck";
import type { SnsFlowCard } from "../../flow-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProjectId = z.string().trim().min(1).max(100);
const CardIndex = z.number().int().positive().max(99);

/**
 * 붙이는 방법 네 가지.
 *
 * 세트는 자리별로 한 번에 붙이는 편의이고, 카드 하나만 갈아 끼우는 것이 그
 * 위에 얹는 예외다 — 「3번 속지만 다른 모양으로」가 실제로 자주 필요하다.
 */
const InputSchema = z.union([
  z.object({ projectId: ProjectId, deckId: z.string().trim().min(1).max(100).default("deck"), deck: LayoutDeckSchema }),
  z.object({ projectId: ProjectId, clear: z.literal(true) }),
  z.object({ projectId: ProjectId, cardIndex: CardIndex, templateId: z.string().trim().min(1).max(100), slots: SlotListSchema }),
  z.object({ projectId: ProjectId, cardIndex: CardIndex, clear: z.literal(true) }),
]);

type Input = z.infer<typeof InputSchema>;

/** 붙이기 전에 막는다. 카드를 다 만든 뒤에 알면 돈만 나간다. */
function blockingProblems(input: Input): string[] {
  if ("deck" in input) {
    return validateDeck(input.deck).filter((issue) => issue.severity === "error").map((issue) => issue.message);
  }
  if ("slots" in input) {
    return validateTemplate({ id: input.templateId, name: "고른 뼈대", role: "body", slots: input.slots })
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message);
  }
  return [];
}

function nextCards(cards: SnsFlowCard[], input: Input): SnsFlowCard[] {
  if ("deck" in input) return applyDeck(cards, input.deck, input.deckId);
  if ("slots" in input) {
    return applyCardLayout(cards, input.cardIndex, { templateId: input.templateId, slots: input.slots });
  }
  if ("cardIndex" in input) return clearCardLayout(cards, input.cardIndex);
  return clearLayout(cards);
}

/**
 * 뼈대를 카드뉴스 작업에 붙인다 — 여기서 레이아웃 고정이 켜진다.
 *
 * 붙이고 나면 그 카드들은 **칸마다 그림을 시키고 글은 우리가 그리는** 길로
 * 간다. 떼면 지금까지 방식(통째로 그리기)으로 돌아간다.
 *
 * 만드는 중에는 못 바꾼다. fal 에 이미 보낸 요청은 취소할 수 없어서, 중간에
 * 뼈대를 갈면 앞뒤 카드가 서로 다른 방식으로 나온다.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = InputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ ok: false, message: "붙일 뼈대와 작업을 확인해 주세요." }, { status: 400 });
  }

  const problems = blockingProblems(parsed.data);
  if (problems.length) {
    return Response.json({ ok: false, message: problems.join(" "), issues: problems }, { status: 400 });
  }

  try {
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(parsed.data.projectId);
    if (!project) return Response.json({ ok: false, message: "작업을 찾을 수 없습니다." }, { status: 404 });

    const flow = project.data.flow;
    if (!flow?.cards.length) {
      return Response.json({ ok: false, message: "원고를 먼저 만들어 주세요." }, { status: 400 });
    }
    if (hasActiveQueuedGeneration(flow)) {
      return Response.json({ ok: false, message: "만드는 중에는 뼈대를 바꿀 수 없습니다." }, { status: 409 });
    }

    const cards = nextCards(flow.cards, parsed.data);
    const saved = await store.save(parsed.data.projectId, { ...flow, cards }, project.status);

    return Response.json({
      ok: true,
      applied: cards.filter((card) => card.layout).length,
      total: cards.length,
      project: saved,
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "뼈대를 작업에 붙이지 못했습니다." },
      { status: 500 },
    );
  }
}
