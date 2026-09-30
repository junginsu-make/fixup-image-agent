import type { Attachment } from "@fixup/sns-core";
import { cardCost, optionsOfProject, type CardOptions } from "./cardnews-options";
import { cardSourceLabel, type CardSource } from "./cardnews-source";

/**
 * **카드뉴스 작업을 「쉽게」가 그릴 것으로**(2단계 설계 §7 · §8). 서버 모듈을
 * 끌어오지 않게 작업 모양을 여기서 좁게 적는다(`app/api/sns/flow-service.ts` 의 부분).
 */
export interface CardnewsProjectLike {
  id: string;
  status: string;
  ratio: string;
  language: string;
  modelId: string;
  cardCountMode: string;
  cardCount?: number | null;
  toneNote?: string | null;
  data: {
    source: CardSource;
    attachments: Attachment[];
    look?: string;
    flow?: {
      planningIssues?: string[];
      copyIssues?: string[];
      cards: Array<{
        index: number; role: string; kind?: string; layout?: unknown;
        copy: { headline: string; body?: string; accent?: string; footnote?: string };
        status: string; assetUrl?: string; thumbUrl?: string;
      }>;
    };
  };
}

export interface EasyCardView {
  index: number;
  role: string;
  headline: string;
  body?: string;
  /** 강조 문구 · 각주. 그림에 찍히므로 원고에서도 보인다(2026-09-30 실제 생성). */
  accent?: string;
  footnote?: string;
  status: string;
  url?: string;
}

export interface EasyCardnewsView {
  projectId: string;
  status: string;
  cards: EasyCardView[];
  issues: string[];
  options: CardOptions;
  sourceLabel: string;
  cost: { units: number; label: string };
  /** 다 만든 장(검토가 필요한 장 포함, 카드뉴스 정산과 같은 셈). */
  done: number;
  total: number;
  /** 만드는 도중 실패한 장 번호(설계 §9 「실패한 장을 적는다」). */
  failed: number[];
  /** 자동 검수가 사람 확인을 권한 장 번호. */
  review: number[];
}

export function cardnewsView(project: CardnewsProjectLike, policy: "cost-v1" | "image-v2"): EasyCardnewsView {
  const flow = project.data.flow;
  const cards = flow?.cards ?? [];
  return {
    projectId: project.id,
    status: project.status,
    cards: cards.map((card) => ({
      index: card.index,
      role: card.role,
      headline: card.copy.headline,
      ...(card.copy.body ? { body: card.copy.body } : {}),
      ...(card.copy.accent ? { accent: card.copy.accent } : {}),
      ...(card.copy.footnote ? { footnote: card.copy.footnote } : {}),
      status: card.status,
      ...(card.assetUrl ? { url: card.assetUrl } : {}),
    })),
    issues: [...(flow?.planningIssues ?? []), ...(flow?.copyIssues ?? [])],
    options: optionsOfProject(project),
    sourceLabel: cardSourceLabel(project.data.source.kind),
    cost: cardCost({
      policy, ratio: project.ratio, modelId: project.modelId,
      attachments: project.data.attachments, cards,
    }),
    done: cards.filter((card) => card.status === "done" || card.status === "review_required").length,
    total: cards.length,
    failed: cards.filter((card) => card.status === "failed").map((card) => card.index),
    review: cards.filter((card) => card.status === "review_required").map((card) => card.index),
  };
}
