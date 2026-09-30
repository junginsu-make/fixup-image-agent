import { jobId, type RunningJob } from "../../lib/running-jobs";
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

/** 결과 칸에 걸 카드. 그림이 온 것만. */
export function cardResults(
  messages: readonly EasyMessage[],
  views: Readonly<Record<string, EasyCardnewsView>>,
): Array<{ id: string; url: string }> {
  return messages.flatMap((message) => (views[message.id]?.cards ?? [])
    .filter((card) => card.url)
    .map((card) => ({ id: `${message.id}:${card.index}`, url: card.url! })));
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
