import type { ImageLook } from "@fixup/shared";
import type { PromptMode } from "@fixup/poster-core";
import type { Role } from "./_components/reference-picker";

/**
 * 이미 만든 작업의 **지난 단계로 돌아갈 때** 화면에 심을 값.
 *
 * 지금까지 01~03 을 누르면 빈 새 작업 화면으로 보냈다. 값이 지워진 것이
 * 아니라 다른 화면으로 간 것인데, 사용자에게는 「다 초기화됐다」로 읽혔다
 * (2026-09-16 사용자 보고).
 *
 * **원래 작업은 안 건드린다.** 고쳐서 만들기를 누르면 새 작업이 하나 더
 * 생긴다 — 그래야 「이렇게도 해 보고 저렇게도 해 보는」 일이 원본을 잃지
 * 않는다.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 규칙이라 값으로 잰다.
 */

export interface PosterSeed {
  title: string;
  instruction: string;
  ratio: string;
  modelId: string;
  variants: number;
  look: ImageLook;
  promptMode: PromptMode;
  userInstruction: string;
  attachmentIntent: string;
  /** 고른 차례 그대로. 화면의 ①②③ 이자 프롬프트의 `Image N`. */
  pickOrder: string[];
  roles: Record<string, Role>;
  /**
   * 못 가져온 참고 이미지 수.
   *
   * **조용히 빠지면 안 된다.** 관리자가 다른 회원의 작업을 다시 만들 때 그
   * 작업이 가리키는 참고 이미지는 그 회원 것이라 못 읽는다. 말해 주지 않으면
   * 사용자는 자기가 안 고른 줄 안다.
   */
  missingReferences: number;
}

/** 이 작업이 읽는 모양. 옛 작업에는 없는 칸이 많아 전부 선택이다. */
interface SourceProject {
  title?: string | null;
  ratio?: string | null;
  modelId?: string | null;
  data?: {
    instruction?: string | null;
    variants?: number | null;
    referenceIds?: string[] | null;
    preservedIds?: string[] | null;
    personIds?: string[] | null;
    restyledIds?: string[] | null;
    attachmentOrder?: string[] | null;
    attachmentIntent?: string | null;
    userInstruction?: string | null;
    look?: ImageLook | null;
    promptMode?: PromptMode | null;
  } | null;
}

const list = (value: readonly string[] | null | undefined): string[] =>
  Array.isArray(value) ? value.filter((id) => typeof id === "string" && id) : [];

/**
 * 첨부를 고른 차례.
 *
 * **차례가 저장돼 있으면 그것을 쓴다.** 없는 옛 작업은 `store.ts` 가 정해 둔
 * 대로 「따라 만들 것 다음에 지킬 것」으로 잇는다.
 *
 * 같은 id 가 두 목록에 있는 옛 작업이 실제로 있다 — 두 번 서면 화면의 ①②③
 * 이 어긋나므로 한 번만 센다.
 */
function orderOf(data: NonNullable<SourceProject["data"]>): string[] {
  const saved = list(data.attachmentOrder);
  const source = saved.length
    ? saved
    : [...list(data.referenceIds), ...list(data.preservedIds)];
  return [...new Set(source)];
}

/**
 * 이 첨부가 무슨 역할이었나.
 *
 * 저장된 모양은 목록 넷으로 갈려 있다(`store.ts`) — 따라 만들 것, 지킬 것,
 * 그중 사람인 것, 그중 그림 느낌만 바꿔도 되는 것. 화면은 한 칸에 한 역할을
 * 쓰므로 되짚어 붙인다.
 */
function roleOf(id: string, data: NonNullable<SourceProject["data"]>): Role | null {
  if (list(data.restyledIds).includes(id)) return "preserve_person_restyled";
  if (list(data.personIds).includes(id)) return "preserve_person";
  if (list(data.preservedIds).includes(id)) return "preserve_product";
  if (list(data.referenceIds).includes(id)) return "style";
  return null;
}

export function posterSeed(
  project: SourceProject,
  visibleReferenceIds: ReadonlySet<string>,
): PosterSeed {
  const data = project.data ?? {};
  const wanted = orderOf(data);
  /*
    **빠진 것을 셀 때는 네 목록을 다 본다.**

    `attachmentOrder` 가 있으면 차례는 그것만 따르는데(`orderOf`), 차례에 안
    담긴 참고 이미지가 있는 옛 작업이 있다 — 그 칸은 2026-09-07 에 생겼고
    정합성 검사는 09-08 에 붙어서 **그 사이 행은 검사를 안 받았다.**

    차례만 세면 그런 작업에서 **빠진 것을 아예 안 센다.** 화면은 「다
    가져왔습니다」라고 말하는데 실제로는 한 장이 사라진 상태다 — 「조용히
    빠지면 사용자는 자기가 안 고른 줄 안다」는 이 파일의 원칙이 거기서 깨진다.
  */
  const everything = new Set([
    ...wanted, ...list(data.referenceIds), ...list(data.preservedIds),
  ]);
  /*
    **못 보는 것은 뺀다.** 골라 둔 채로 두면 화면에는 ①②③ 이 서는데 실제로는
    아무 그림도 없어, 만들기를 눌러야 그제서야 이상해진다.
  */
  const pickOrder = wanted.filter((id) => visibleReferenceIds.has(id));

  /*
    **역할이 없는 것은 고른 것으로 치지 않는다.** 차례에만 있고 네 목록 어디에도
    없는 id 가 옛 작업에 있다 — 그대로 두면 화면에는 ①이 서는데 저장할 때
    빠져서 만들면 없다.
  */
  const roles: Record<string, Role> = {};
  const picked: string[] = [];
  for (const id of pickOrder) {
    const role = roleOf(id, data);
    if (!role) continue;
    roles[id] = role;
    picked.push(id);
  }

  return {
    title: project.title ?? "",
    instruction: data.instruction ?? "",
    ratio: project.ratio ?? "2:3",
    modelId: project.modelId ?? "",
    variants: Number(data.variants) > 0 ? Number(data.variants) : 1,
    // 없는 칸은 지금까지의 동작으로 읽는다 — `store.ts` 가 칸마다 적어 둔 그대로다.
    look: data.look ?? "auto",
    promptMode: data.promptMode ?? "assisted",
    userInstruction: data.userInstruction ?? "",
    attachmentIntent: data.attachmentIntent ?? "",
    pickOrder: picked,
    roles,
    missingReferences: everything.size - picked.length,
  };
}

/** 복사해 온 참고 이미지 하나. 원래 id 에서 새 id 로. */
export interface AdoptedReference {
  from: string;
  id: string;
}

/**
 * 작업이 가리키는 참고 이미지 id 를 **복사본 id 로 바꿔 끼운다.**
 *
 * 관리자가 다른 회원의 작업을 다시 만들면 02 가 비었다 — 붙였던 그림이 그
 * 회원 것이라 관리자 목록에 없어서, `posterSeed` 의 「못 보는 것은 뺀다」에
 * 전부 걸렸다(2026-09-16 운영 데이터로 확인). 그림을 관리자 라이브러리로
 * 복사한 뒤 이것으로 id 를 바꾸면, 복사본은 볼 수 있는 목록에 있으므로 역할과
 * 차례까지 그대로 살아난다.
 *
 * **다섯 목록을 모두 바꾼다.** 하나라도 빠지면 역할 되짚기(`roleOf`)가 그 갈래를
 * 못 찾아 역할이 바뀐다 — 사람을 지키던 그림이 물건 지키기로 돌아온다.
 *
 * **복사 못 한 id 는 그대로 둔다.** 라이브러리에서 이미 지워진 그림이 실제로
 * 있다. 그대로 두면 볼 수 있는 목록에 없어서 빠진 수로 세어지고, 화면이
 * 「가져오지 못했습니다」라고 말한다.
 */
export function adoptPosterReferences<
  T extends NonNullable<SourceProject["data"]>,
>(data: T, adopted: readonly AdoptedReference[]): T {
  if (!adopted.length) return data;
  const byOriginal = new Map(adopted.map((entry) => [entry.from, entry.id]));
  const swap = (ids: string[] | null | undefined) =>
    Array.isArray(ids) ? ids.map((id) => byOriginal.get(id) ?? id) : ids;

  return {
    ...data,
    referenceIds: swap(data.referenceIds),
    preservedIds: swap(data.preservedIds),
    personIds: swap(data.personIds),
    restyledIds: swap(data.restyledIds),
    attachmentOrder: swap(data.attachmentOrder),
  };
}
