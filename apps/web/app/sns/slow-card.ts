/**
 * **카드 한 장이 3분을 넘으면 「늦어지고 있다」고 알린다**(2026-10-07 Task 6).
 *
 * fal 한 장이 446초 걸린 날 화면은 말없이 「만드는 중」이었다. **안내만 한다** — 다시 보내거나
 * 취소하지 않는다. 이미 보낸 요청은 값이 나가므로 다시 보내면 두 번 낸다.
 *
 * 기준은 fal 에 실제로 보낸 시각(`lib/sns/queued-flow.ts` 의 `submitNext` 가 적는다). 카드에 그
 * 시각이 없으면(옛 작업) 화면이 「만드는 중」을 처음 본 시각부터 잰다. 화면 파일은 시험이 못
 * 읽으므로 판단만 여기 둔다. 카드뉴스 결과판과 「쉽게」가 함께 쓴다.
 */

export const SLOW_CARD_MS = 3 * 60_000;
export const SLOW_CARD_NOTICE = "그림 업체가 늦어지고 있습니다. 조금만 더 기다려 주세요.";

/** 보낸 시각을 읽을 카드 모양. 서버 모듈을 끌어오지 않게 좁게 적는다(`app/api/sns/flow-service.ts` 의 부분). */
export interface SubmittedCardLike {
  generationStartedAt?: string;
  slotJobs?: ReadonlyArray<{ status: string; startedAt?: string }>;
}

export interface SlowCardLike {
  index: number;
  status: string;
  /** fal 에 보낸 시각(밀리초). 모르면 비운다. */
  submittedAt?: number;
}

const 읽기 = (value: string | undefined): number | undefined => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** 지금 돌고 있는 요청을 보낸 시각. 레이아웃 카드는 칸마다 요청이 따로라 돌고 있는 칸의 시각이다. */
export function cardSubmittedAt(card: SubmittedCardLike): number | undefined {
  const running = card.slotJobs?.find((job) => job.status === "generating");
  return 읽기(running ? running.startedAt : card.generationStartedAt);
}

/** 「만드는 중」인 카드를 처음 본 시각. 이미 본 카드는 그대로 두고, 끝난 카드는 지운다. */
export function rememberGenerating(
  seen: Readonly<Record<number, number>>,
  cards: ReadonlyArray<{ index: number; status: string }>,
  now: number,
): Record<number, number> {
  return Object.fromEntries(
    cards.filter((card) => card.status === "generating").map((card) => [card.index, seen[card.index] ?? now]),
  );
}

/** 3분을 넘긴 카드 번호. */
export function slowCardIndexes(
  cards: readonly SlowCardLike[],
  seen: Readonly<Record<number, number>>,
  now: number,
): number[] {
  return cards
    .filter((card) => {
      if (card.status !== "generating") return false;
      const since = card.submittedAt ?? seen[card.index];
      return since !== undefined && now - since >= SLOW_CARD_MS;
    })
    .map((card) => card.index);
}
