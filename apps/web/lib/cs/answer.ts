import type { RetrievedKnowledge } from "@fixup/redesign-core";
import { keepKnownTopics, type AccountTopic } from "./topics";

/**
 * **답을 쓰기 전과 쓴 뒤의 판단.**
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────
 *
 * 하나다 — **근거 없이 말하지 않는다.**
 *
 * 모델은 그럴듯한 말을 잘 만든다. 설명서에 없는 것을 물으면 **있는 것처럼**
 * 답한다. CS 에서 그것은 「없는 것만 못하다」 — 「결제가 안 돼요」에 잘못
 * 답하면 돈 문제가 된다.
 *
 * 그래서 근거가 없으면 **모델에게 묻지도 않는다.** 물어 놓고 「모른다고
 * 답해라」라고 부탁하는 것보다, 부르지 않는 편이 확실하고 값도 안 든다.
 */

/** 모델이 돌려줘야 하는 모양. */
export interface CsDecision {
  /** 무엇을 묻는가. */
  kind: "guide" | "account" | "smalltalk" | "handoff";
  /** 계정 갈래. `account` 일 때만 본다. */
  topics?: unknown;
  /** 설명서를 찾을 때 쓸 말. 사용자 말 그대로여도 된다. */
  query?: string;
}

export interface CsSource {
  /** 사용자에게 보여 줄 이름. */
  name: string;
  /** 눌러서 갈 곳. 없으면 안 보여 준다. */
  href: string;
}

export type CsPlan =
  | { act: "search"; query: string }
  | { act: "account"; topics: AccountTopic[] }
  | { act: "talk" }
  | { act: "handoff" };

/**
 * 모델이 고른 것을 **믿을 수 있는 모양**으로 바꾼다.
 *
 * **모르는 값은 버린다.** 구조화 응답이라도 목록 밖 값이 오는 일이 있다 —
 * 이 저장소가 두 번 겪었다(`invented`·`hasText`). 조용히 넘어가면 엉뚱한
 * 갈래를 탄다.
 */
export function planFrom(decision: unknown, question: string): CsPlan {
  const d = (decision ?? {}) as CsDecision;

  if (d.kind === "handoff") return { act: "handoff" };

  if (d.kind === "account") {
    const topics = keepKnownTopics(d.topics);
    // 계정을 묻는다면서 무엇을 물을지 못 골랐다. 설명서로 돌린다.
    return topics.length ? { act: "account", topics } : { act: "search", query: question };
  }

  if (d.kind === "smalltalk") return { act: "talk" };

  const query = typeof d.query === "string" && d.query.trim() ? d.query.trim() : question;
  return { act: "search", query };
}

/**
 * **근거가 쓸 만한가.**
 *
 * `retrieveKnowledge` 가 이미 유사도 하한으로 거른다. 여기서 한 번 더 보는
 * 것은 **몇 조각이 남았는가**다 — 하한을 겨우 넘은 조각 하나로 답을 쓰면
 * 그럴듯한 오답이 나온다.
 */
export function hasUsableEvidence(chunks: readonly RetrievedKnowledge[]): boolean {
  return chunks.length > 0;
}

/** 조각에서 출처를 뽑는다. 같은 문서는 한 번만. */
export function sourcesFrom(chunks: readonly RetrievedKnowledge[]): CsSource[] {
  const 본것 = new Set<string>();
  const out: CsSource[] = [];

  for (const chunk of chunks) {
    /*
      **주소는 글 안에 박아 두었다**(`guide-text.ts`). 조각이 잘려도 출처를
      잃지 않게 첫 줄에 `[이름] (/주소)` 를 넣는다.
    */
    const href = /\((\/[^\s)]*)\)/.exec(chunk.content)?.[1] ?? "";
    const name = chunk.sourceName;
    const 열쇠 = `${name}|${href}`;
    if (본것.has(열쇠)) continue;
    본것.add(열쇠);
    out.push({ name, href });
  }
  return out;
}

/**
 * 근거를 모델에게 줄 모양으로.
 *
 * **조각마다 번호를 붙인다.** 답에서 어느 조각을 썼는지 모델이 가리킬 수
 * 있어야 하고, 사람이 읽을 때도 섞이지 않는다.
 */
export function evidenceBlock(chunks: readonly RetrievedKnowledge[]): string {
  return chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.sourceName}\n${chunk.content}`)
    .join("\n\n");
}

/** 근거가 없을 때 하는 말. 이 문장이 봇의 정직함이다. */
export const NO_EVIDENCE =
  "이건 제가 확실히 알지 못합니다. 설명서에서 근거를 찾지 못했어요. 아래 「문의 남기기」로 보내 주시면 담당자가 확인하고 답해 드립니다.";

/** 로그인하지 않은 사람에게. */
export const NEEDS_LOGIN =
  "크레딧·플랜처럼 계정에 대한 것은 로그인하셔야 알려 드릴 수 있습니다.";

/** 사람에게 넘길 때. */
export const HANDOFF =
  "이건 담당자가 직접 봐야 할 것 같습니다. 아래 「문의 남기기」로 보내 주시면 확인하고 답해 드립니다.";

/**
 * **답에 근거를 붙일 수 있는가.**
 *
 * 설명서를 근거로 쓴 답에만 출처를 붙인다. 내 계정 사실은 설명서에서 온 것이
 * 아니므로 붙이지 않는다 — 안 그러면 「내 크레딧 70장」에 엉뚱한 문서가
 * 근거처럼 달린다.
 */
export function showsSources(plan: CsPlan): boolean {
  return plan.act === "search";
}
