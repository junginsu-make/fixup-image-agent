import { ATTACHMENT_ROLE_LABEL, type AttachmentRole } from "./attachment-role";
import type { OrderedAttachment } from "./attachment-order";

/**
 * 저장된 작업에서 첨부를 되살린다.
 *
 * ── 왜 여기 있나 ─────────────────────────────────────────────────
 *
 * 이 규칙이 라우트 파일 두 곳에 나뉘어 적혀 있었다 — 그림을 만드는 쪽과 기획을
 * 돌리는 쪽. 라우트 안에 있으면 **시험이 못 붙는다.** 실제로 그 사이에 차이가
 * 생겨 있었고(아래 「차례가 없을 때」), 시험이 없어 아무도 못 봤다.
 *
 * 둘 다 순수 함수라 여기 있을 이유가 충분하다.
 */

/** 저장된 작업이 첨부에 대해 아는 것. 옛 작업에는 `attachmentOrder` 가 없다. */
export interface StoredAttachmentData {
  attachmentOrder?: string[];
  preservedIds?: string[];
  personIds?: string[];
  /** personIds 중 그림 느낌만 바꿔도 되는 것 (설계 §4-3). */
  restyledIds?: string[];
}

/**
 * 이 id 가 어떤 역할이었나.
 *
 * 그림 느낌 바꾸는 사람 → 사람 → 물건 → 따라 만들기 순으로 판정한다.
 * 뒤로 갈수록 넓은 목록이라, 좁은 것을 먼저 봐야 한다.
 */
export function roleOf(data: StoredAttachmentData, id: string): AttachmentRole {
  // **그림 느낌을 바꿔도 되는 사람을 먼저 본다.** 그 목록은 사람 목록의
  // 부분집합이라, 사람을 먼저 보면 이 역할이 영영 안 나온다(설계 §4-3).
  if ((data.restyledIds ?? []).includes(id)) return "preserve_person_restyled";
  if ((data.personIds ?? []).includes(id)) return "preserve_person";
  if ((data.preservedIds ?? []).includes(id)) return "preserve_product";
  return "style";
}

/**
 * 저장된 차례로 첨부를 되살린다 — 그림을 만들 때.
 *
 * 차례가 없으면(옛 작업) 빈 배열을 준다. 부르는 쪽이 그때 두 목록을 이어
 * 붙인다(`orderFromLegacyLists`) — 그것이 지금까지의 동작이다.
 *
 * 올린 주소가 없는 id 는 뺀다. 라이브러리에서 지운 그림이 차례에는 남아 있을
 * 수 있다.
 */
export function restoreAttachments(
  data: StoredAttachmentData,
  urls: Record<string, string>,
): OrderedAttachment[] {
  const order = data.attachmentOrder ?? [];
  if (!order.length) return [];

  return order
    .filter((id) => urls[id])
    .map((id): OrderedAttachment => ({ url: urls[id]!, role: roleOf(data, id) }));
}

/** 기획 AI 에게 넘길 한 줄. 번호는 화면·프롬프트와 같은 것을 쓴다. */
export interface PlanReference {
  title: string;
  grammar?: string;
  number: number;
  roleLabel: string;
  /** 이 그림에 있는 사람들 — 한 명당 한 줄. 읽은 것이 없으면 없다. */
  people?: string[];
}

/**
 * 기획 AI 에게 넘길 목록 — **거른 뒤에 번호를 매긴다.**
 *
 * 매기고 나서 거르면 번호에 구멍이 생긴다. 첨부 하나를 라이브러리에서 지운 뒤
 * 기획을 다시 돌리면 기획은 `1. A … 3. C` 를 보는데 최종 프롬프트는
 * `Image 1=A, Image 2=C` 를 쓴다 — 기획이 「3번 그림」을 근거로 칸을 채우면
 * 그 3번은 존재하지 않는다(2026-09-07 리뷰).
 *
 * ── 차례가 없을 때 `restoreAttachments` 와 다르게 답한다 ─────────
 *
 * 그림을 만드는 쪽은 빈 배열을 주고 부르는 쪽이 두 목록을 이어 붙인다.
 * 여기서는 **넘겨받은 목록 순서**를 그대로 쓴다.
 *
 * 다른 이유가 있다. 기획은 프롬프트를 만드는 것이 아니라 **칸을 채우는** 일이라,
 * 번호가 최종 프롬프트와 한 칸 어긋나도 결과가 크게 틀어지지 않는다. 반면
 * 목록을 통째로 비우면 기획이 첨부를 아예 모르게 되어 「첨부한 그림과 겉도는
 * 칸」이라는 원래 문제로 되돌아간다.
 *
 * 부르는 쪽이 `[...references, ...preserved]` 를 넘기므로, 옛 작업에서는 그
 * 순서(따라 만들기 먼저)가 곧 최종 프롬프트의 순서와 같다 — 옛 작업은
 * `orderFromLegacyLists` 도 같은 순서로 이어 붙인다. **결국 어긋나지 않는다.**
 */
export function planReferences(
  data: StoredAttachmentData,
  all: Array<{ id: string; title?: string | null }>,
  summaries: Record<string, string | undefined>,
  /** 첨부마다 읽어 둔 사람 줄. 없으면 지금까지 그대로다. */
  people: Record<string, string[]> = {},
): PlanReference[] {
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const order = data.attachmentOrder?.length
    ? data.attachmentOrder
    : all.map((entry) => entry.id);

  return order
    .map((id) => {
      const entry = byId.get(id);
      return entry ? { id, entry } : null;
    })
    .filter((row): row is { id: string; entry: { id: string; title?: string | null } } =>
      row !== null)
    .map(({ id, entry }, index): PlanReference => ({
      title: entry.title ?? "레퍼런스",
      grammar: summaries[id],
      number: index + 1,
      roleLabel: ATTACHMENT_ROLE_LABEL[roleOf(data, id)],
      people: people[id],
    }));
}
