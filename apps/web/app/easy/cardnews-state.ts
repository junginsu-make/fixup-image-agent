import { jobId, type RunningJob } from "../../lib/running-jobs";
import { cardCost } from "./cardnews-options";
import type { EasyCardnewsView } from "./cardnews-view";
import type { CardPhotoRole } from "./photo-roles";
import type { EasyMessage } from "./turn";

/**
 * **「쉽게」 화면의 카드뉴스 판단**(2단계 설계 §4 · §7 · §8). 화면 안에 두면 값으로
 * 못 잰다. 화면은 이것을 부르기만 한다.
 */

export type EasyKind = "image" | "cardnews";

/** 물어본 뒤 다시 보낼 때 싣는 것. 비우면 입력창의 말을 보낸다. */
export interface EasyResend {
  prompt: string;
  ratio?: string;
  look?: string;
  photoRoles?: Array<{ id: string; role: CardPhotoRole }>;
  /** 고른 갈래(2단계 §4). */
  kind?: EasyKind;
  /** 저장한 세트에서 온 자리(2단계 §5-2). */
  photoSlots?: Array<{ id: string; role: string }>;
}

/** 마지막 카드뉴스 원고 줄. 「이대로 만들기」 · 조건 줄은 이 줄에만 있다(설계 §7). */
export function latestCardnewsRow(
  messages: readonly EasyMessage[],
  views: Readonly<Record<string, EasyCardnewsView>>,
): string | undefined {
  return [...messages].reverse().find((message) => message.role === "image" && views[message.id])?.id;
}

/** 결과 칸에 걸 카드. 그림이 온 것만. 한 벌은 같은 묶음(`group`)이다. */
export function cardResults(
  messages: readonly EasyMessage[],
  views: Readonly<Record<string, EasyCardnewsView>>,
): Array<{ id: string; url: string; group: string }> {
  return messages.flatMap((message) => (views[message.id]?.cards ?? [])
    .filter((card) => card.url)
    .map((card) => ({ id: `${message.id}:${card.index}`, url: card.url!, group: message.id })));
}

/**
 * **결과 칸 차례.** 새것이 위(1단계 사용자 결정)는 지키되, 카드뉴스 한 벌은 묶음째
 * 옮겨 안에서는 1번 장부터 읽히게 한다. `at` 은 만든 차례(크게 보기 번호)다.
 */
export function newestFirst<T extends { group?: string }>(items: readonly T[]): Array<{ item: T; at: number }> {
  const 묶음: Array<Array<{ item: T; at: number }>> = [];
  items.forEach((item, at) => {
    const last = 묶음[묶음.length - 1];
    if (item.group && last?.[0]?.item.group === item.group) last.push({ item, at });
    else 묶음.push([{ item, at }]);
  });
  return 묶음.reverse().flat();
}

export function generatingProjects(views: Readonly<Record<string, EasyCardnewsView>>): string[] {
  return Object.values(views).filter((view) => view.status === "generating").map((view) => view.projectId);
}

/** 저장한 세트 → 붙일 그림과 자리. 내 라이브러리에 없는 그림은 세어 알린다. */
export function setItemsToAttach(
  set: { items: ReadonlyArray<{ referenceImageId: string; role: string }> },
  library: ReadonlyArray<{ id: string; url?: string; title?: string | null }>,
) {
  const byId = new Map(library.map((row) => [row.id, row]));
  const found = set.items.filter((item) => byId.get(item.referenceImageId)?.url);
  const attach = [...new Map(found.map((item) => {
    const row = byId.get(item.referenceImageId)!;
    return [row.id, { id: row.id, url: row.url!, title: row.title || "레퍼런스" }];
  })).values()];
  return {
    attach,
    slots: found.map((item) => ({ id: item.referenceImageId, role: item.role })),
    missing: set.items.length - found.length,
  };
}

/**
 * **셸에 그 대화 주소로 등록한다**(설계 §8). 대화 화면에 있을 때는 셸이 안 부르고
 * (`href === pathname`), 떠나면 셸이 부른다. 한 작업을 둘이 겹쳐 부르지 않는다.
 */
export function cardnewsJob(projectId: string, conversationId: string, title: string): RunningJob {
  return {
    id: jobId("sns", projectId),
    tool: "sns",
    title: title || "카드뉴스",
    href: `/easy/${conversationId}`,
    startedAt: Date.now(),
    poll: { url: `/api/sns/projects/${projectId}/status` },
  };
}

/**
 * **고른 갈래를 이어 보낸다**(설계 §4). 「이미지 한 장」을 고른 뒤 비율 물음이나
 * 사진 물음에 답해 다시 보내면, 서버는 같은 말을 또 판단한다. 갈래를 안 실으면
 * 「한 장인가 여러 장인가」가 또 뜬다. 새로 친 말에는 안 붙인다.
 */
export function continuingKind(input: {
  explicit?: EasyKind;
  pending?: EasyKind;
  continuing: boolean;
  photoMode?: "image" | "cardnews";
}): EasyKind | undefined {
  if (input.explicit) return input.explicit;
  if (!input.continuing) return undefined;
  return input.pending ?? (input.photoMode === "cardnews" ? "cardnews" : undefined);
}

/**
 * **레퍼런스 요청의 답**(설계 §5-3). 「따라 만들 카드뉴스를 붙여 주세요」에 답해 붙인
 * 그림은 분위기 참고로 **확정**해 보낸다. 판단에 맡기면 제품 사진으로 읽혀 자리가
 * 버려지고, 분위기 참고가 없다며 같은 요청이 다시 뜬다(2단계 독립 리뷰 2). 요청 전부터
 * 붙어 있던 그림은 지금처럼 판단에 맡긴다. 그 사이 뺀 그림은 안 보낸다.
 */
export function referenceAnswer(input: {
  added: readonly string[];
  attachedIds: readonly string[];
  slots: ReadonlyArray<{ id: string; role: string }>;
}): { photoRoles: Array<{ id: string; role: "style" }>; photoSlots: Array<{ id: string; role: string }> } {
  const 붙은것 = new Set(input.attachedIds);
  const ids = [...new Set(input.added)].filter((id) => 붙은것.has(id));
  return {
    photoRoles: ids.map((id) => ({ id, role: "style" as const })),
    photoSlots: input.slots.filter((slot) => 붙은것.has(slot.id)),
  };
}

/**
 * **셸에 새로 걸 작업**(설계 §8). 같은 작업이 **이 대화 주소로** 걸려 있을 때만
 * 건너뛴다. 카드뉴스 화면에 들렀다 오면 주소가 `/sns/…` 로 바뀌어 있어, 그대로 두면
 * 셸(`href !== pathname`)과 이 화면이 같은 작업을 같이 부른다(2단계 독립 리뷰 3).
 */
export function jobsToRegister(
  generating: readonly string[],
  jobs: ReadonlyArray<{ id: string; href: string }>,
  conversationId: string,
): string[] {
  const href = `/easy/${conversationId}`;
  return generating.filter((id) => !jobs.some((job) => job.id === jobId("sns", id) && job.href === href));
}

/**
 * **「이대로 만들기」 답을 못 받았을 때**(미뤄 둔 것 3). 서버는 시작했는데 답이 화면에 안
 * 닿으면 원고 그대로 멈춰 있었다. 다시 읽은 작업이 원고 단계를 지났으면 시작한 것이다.
 */
export function startedDespiteError(status: string | undefined): boolean {
  return status !== undefined && status !== "copy_ready";
}

/**
 * **장 도구**(3단계 §4) — 한 장의 글 칸 또는 다시 만들기 확인 줄. 한 번에 하나만 열린다.
 */
export type CardTool = { rowId: string; index: number; mode: "edit" | "redo"; note?: string } | null;

/**
 * 도구를 연다. 같은 장 같은 도구를 다시 누르면 닫는다. 말 「3번 다시」로 열 때는(`keep`)
 * 이미 열려 있어도 닫지 않고 바라는 점만 바꾼다.
 */
export function openTool(current: CardTool, next: CardTool, options: { keep?: boolean } = {}): CardTool {
  if (!next) return null;
  const 같은것 = current && current.rowId === next.rowId && current.index === next.index && current.mode === next.mode;
  return 같은것 && !options.keep ? null : next;
}

/**
 * **다시 만들기 값**(설계 §4). 그 장 하나로 센다 — 카드뉴스 한 장 다시 만들기 라우트가
 * `onlyCardIndexes: [index]` · `creditImagePlan(1, …)` 로 잡는 것과 같은 단위다.
 */
export function redoCostLabel(
  view: Pick<EasyCardnewsView, "options" | "cards">,
  index: number,
  policy: "cost-v1" | "image-v2",
): string {
  return cardCost({ policy, ratio: view.options.ratio, modelId: view.options.modelId, attachments: [], cards: [{ index }] }).label;
}
