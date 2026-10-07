import { NOTHING_TO_EDIT } from "../../app/easy/chat";
import { ASK_TARGET_NOTE } from "../../app/easy/chat-facts";
import { doneImageNumbers, type EasyResultEntry } from "../../app/easy/image-numbers";
import { IMAGE_NOT_READY, lastEasyImage, projectTarget, type EasyImageTarget } from "./image-edit-turn";
import type { EasyImageFacts } from "./image-list";

/**
 * **고칠 번호 검증 — 줄 단위**(2026-10-07 2차 설계 D2 · §3-2).
 *
 * 고칠 수 있는 것은 이 대화에서 만든, 지워지지 않은, 다 만들어진 포스터 이미지뿐이다. 판단 모델이
 * 목록을 보고 고른 번호를 여기서 다시 본다. 결과물 번호는 카드뉴스 · 지운 결과도 함께 세므로(2차 최종
 * 리뷰 5) **이미지 번호일 때만** 고친다 — 없는 번호 · 카드뉴스 · 지운 결과 · 못 만듦은 값 없이 사실대로
 * 답하고, 만드는 중이면 기다리라고 한다. 이 답들은 코드가 쓴 사실 문장이다(설계 §3-2 · §4 의 의도한 차이 —
 * 그때 판단 모델의 reply 는 고치겠다고 쓴 글이다). 번호가 없으면 예전처럼 마지막 결과(「방금 거」).
 *
 * **확인 못 한 결과물(`unknown`)은 고치지 않는다**(리뷰 1차 수정 2). 저장소를 못 읽은 것이라 그림이 있는지
 * 모른다 — 지금은 확인할 수 없다고만 답한다. 번호 없이 고쳐 달라는데 마지막 결과물이 그것이어도 같다.
 * 다만 최근 100개 밖이라 안 읽은 것(`unreadOld`)은 기다려도 안 되므로 오래되어 못 고친다고 답한다(후속 Task 2).
 */
type Row = { id?: string; role: string; workId?: string | null; body?: string | null; createdAt?: string };

export type EditTargetPick =
  | { ok: true; target: EasyImageTarget; rowId?: string; n?: number }
  | { ok: false; message: string };

function 고칠수있는것(facts: EasyImageFacts): string {
  const 번호들 = doneImageNumbers(facts.entries).map((n) => `이미지 ${n}`);
  return 번호들.length ? `고칠 수 있는 것은 ${번호들.join(" · ")} 입니다.` : "";
}

const 잇는다 = (...parts: string[]) => parts.filter(Boolean).join(" ");

/** 번호 물음 뒤 번호 없이 답했는데 다 만든 이미지가 없을 때(Task 8 고침 2). */
export const NO_DONE_IMAGE =
  "다 만든 이미지가 아직 없어 고칠 수 없습니다. 만드는 중이면 끝난 뒤에, 만들지 못했으면 새로 만든 뒤에 말씀해 주세요.";

/** 번호 물음 뒤 번호 없이 답했는데 다 만든 이미지가 여럿일 때. 라우트가 먼저 다시 묻는다 — 막이다. */
export const TARGET_BY_NUMBER = "어느 이미지를 고칠지 「이미지 2」처럼 번호로 말씀해 주세요.";

const 확인못함 = (n: number) => `지금은 결과물 ${n} 을 확인할 수 없습니다. 잠시 뒤 다시 말씀해 주세요.`;

/**
 * 100개 밖의 옛 결과물(후속 Task 2). 고치는 길은 라이브러리가 아니다 — 라이브러리 카드는 보기 창만 열고, 「과정 보기」는
 * 내 쉽게 작업이면 이 대화로 돌아온다(`app/library/easy-href.ts`). 사이드바 「다양하게」(`/poster`)의 지난 작업은 쉽게로
 * 만든 포스터 작업도 싣고(`api/poster/projects`), 연 화면(`/poster/{id}`)에 「이 장만 고치기」가 있다. 카드뉴스라면 `/sns` 의
 * 지난 작업에서 열어 카드마다 「다시 만들기」(무엇을 고칠지 적는 칸 있음)다. 프로젝트 거름(`selectedProjectFor`)은 팀이 있을
 * 때만 걸리고 지금은 팀 기능이 잠들어 있어 안내하지 않는다. 지운 것일 수도 있다.
 */
const 오래됨 = (n: number) =>
  `결과물 ${n} 은 오래되어 이 대화에서는 고칠 수 없습니다. 지우지 않았다면 이미지는 「다양하게」 화면의 지난 작업에서 열어 「이 장만 고치기」로, 카드뉴스는 「카드뉴스」 화면의 지난 작업에서 열어 「다시 만들기」로 고쳐 주세요.`;

const 모름답 = (facts: EasyImageFacts, n: number) => (facts.unreadOld?.has(n) ? 오래됨(n) : 확인못함(n));

/** 번호의 사정을 사실대로(이미지가 아니거나 다 안 만든 번호). 다 만든 이미지면 `undefined`. */
function 못고치는까닭(facts: EasyImageFacts, target: number): string | undefined {
  const entry = facts.entries.find((one) => one.n === target);
  const 고칠것 = 고칠수있는것(facts);
  if (!entry) return 잇는다(`${target}번은 이 대화에 없습니다.`, 고칠것);
  if (entry.kind === "unknown") return 모름답(facts, target);
  if (entry.kind === "cardnews") {
    return 잇는다(`${target}번은 카드뉴스라 이미지 고치기로는 고칠 수 없습니다. 카드뉴스는 「3번 장 더 짧게」처럼 말씀해 주세요.`, 고칠것);
  }
  if (entry.kind === "deleted") return 잇는다(`${target}번은 지운 결과라 고칠 수 없습니다.`, 고칠것);
  if (entry.state === "making") return IMAGE_NOT_READY;
  if (entry.state === "failed") return 잇는다(`이미지 ${target}번은 만들지 못한 이미지라 고칠 수 없습니다. 새로 만들어 주세요.`, 고칠것);
  return undefined;
}

/** 지운 것을 뺀 마지막 결과물(`lastIsImage` 와 같은 기준). */
function 마지막결과(entries: readonly EasyResultEntry[]): EasyResultEntry | undefined {
  return [...entries].reverse().find((one) => one.kind !== "deleted");
}

/**
 * `afterTargetAsk`: 번호 물음에 번호 없이 말로 답했다(Task 8 고침 2). 「마지막 이미지」로 가지 않는다 — 그것은
 * 만드는 중 · 못 만든 것일 수 있다. 다 만든 것이 하나면 **그 줄**, 없으면 값 없이 사실 문장이다.
 */
export async function pickEditTarget(
  userId: string, rows: readonly Row[], facts: EasyImageFacts, target: number | undefined,
  options: { afterTargetAsk?: boolean } = {},
): Promise<EditTargetPick> {
  if (!target && options.afterTargetAsk) {
    const 다만든 = doneImageNumbers(facts.entries);
    if (다만든.length === 1) return pickEditTarget(userId, rows, facts, 다만든[0]);
    return { ok: false, message: 다만든.length ? TARGET_BY_NUMBER : NO_DONE_IMAGE };
  }
  if (!target) {
    const 끝 = 마지막결과(facts.entries);
    if (끝?.kind === "unknown") return { ok: false, message: 모름답(facts, 끝.n) };
    // 말하지 않았으면 마지막 결과. 마지막이 카드뉴스면 이 대화의 마지막 이미지(지운 것 · 카드뉴스는 건너뜀).
    const 마지막 = await lastEasyImage(userId, rows)
      ?? await projectTarget(userId, [...facts.entries].reverse().find((one) => one.kind === "image")?.workId);
    return 마지막 ? { ok: true, target: 마지막 } : { ok: false, message: NOTHING_TO_EDIT };
  }
  const 까닭 = 못고치는까닭(facts, target);
  if (까닭) return { ok: false, message: 까닭 };
  const entry = facts.entries.find((one) => one.n === target)!;
  const found = await projectTarget(userId, entry.workId);
  return found ? { ok: true, target: found, rowId: entry.rowId, n: entry.n } : { ok: false, message: NOTHING_TO_EDIT };
}

/**
 * **어느 이미지를 고칠지 묻는다**(2차 D2). 판단 모델이 `talk` + `note` = `ask_target` 이고 다 만든
 * 이미지가 둘 이상일 때만 그 번호들(카드뉴스 번호는 안 센다). 물음 줄(`ask:target`)에 번호 단추가 달린다.
 * 라우트는 **실행하는 갈래**(`wants`)로 부른다 — 고른 갈래가 이겨 image 로 가는 턴에서 묻지 않게.
 *
 * `afterTargetAsk`: 이번 말이 번호 물음에 말로 한 답이다. 그런데 번호 없는 image_edit 이면 마지막 이미지로
 * 몰래 떨어뜨리지 않고 다시 묻는다 — 물은 것은 「어느 이미지」였다.
 */
export function targetAskNumbers(
  decision: { wants: string; note?: string; target?: number },
  facts: EasyImageFacts,
  options: { afterTargetAsk?: boolean } = {},
): number[] | undefined {
  const 다만든 = doneImageNumbers(facts.entries);
  if (다만든.length < 2) return undefined;
  const 물으라함 = decision.wants === "talk" && decision.note === ASK_TARGET_NOTE;
  const 번호없는답 = options.afterTargetAsk === true && decision.wants === "image_edit" && !decision.target;
  return 물으라함 || 번호없는답 ? 다만든 : undefined;
}
