import { isLocalStoreEnabled } from "../../local-store";
import { createSupabaseAdminClient } from "../../supabase/admin";
import { reorderLibraryImages, replaceLibraryImageAt, saveLibraryItem } from "../../server-library";
import { serverDocumentsEnabled } from "../documents/flags";
import {
  artifactTag,
  libraryFileKey,
  parseLibraryFileKey,
  planItemSync,
  sectionKey,
  type PageEntry,
} from "./library-sync-plan";

/**
 * 상세페이지 결과를 **서버가 직접** 라이브러리에 맞춰 둔다(2026-09-28 사용자 결정).
 *
 * ── 왜 ──────────────────────────────────────────────────────
 *
 * 전에는 브라우저가 등록했다. 만든 직후 창을 닫거나 저장이 실패하면 그림은 서버에
 * 있는데 라이브러리에는 안 보였다 — 09-23 에 8장이 실제로 그렇게 빠졌다.
 *
 * ── 무엇을 ──────────────────────────────────────────────────
 *
 * 페이지(지금 섹션 차례)를 라이브러리 작업 **하나**에 맞춘다. 파일 이름에 **섹션과
 * 그림의 지문**을 새겨
 *   - 지문이 다른 자리만 바꾸고, 없던 섹션은 붙이고, 순서가 바뀌었으면 옮긴다
 *   - **아무것도 지우지 않는다**(1차 리뷰 HIGH-1)
 *   - 작업에 지금 페이지에 없는 섹션이 있으면 그 작업은 그대로 두고 새 작업(2차 MEDIUM-1)
 *
 * **그림은 화면이 보고 있는 것이 기준이다**(3차 리뷰 HIGH). 서버가 넣는 그림은 둘뿐이다.
 *   - 생성 라우트가 **방금 만든** 그림(`images`) — 창을 닫아도 라이브러리에 남는다
 *   - 화면이 보낸 그림(`images`, 확인 문의 `supplied`)
 * 화면은 섹션마다 **지문**(`pageHashes`)을 보낸다. 작업의 그림과 지문이 다르면 서버는
 * 그 섹션을 「없음」(`missing`)으로 알리고, 화면이 그 한 장을 보낸다. 서버의 옛 생성
 * 기록으로 채우지 않는다 — 예전 초안·기록 실패·겹친 요청에서 화면과 달라, 틀린 그림을
 * 두고 「저장됨」이라 했다.
 *
 * 작업은 문서 id 로 찾는다(`source_id`, 자기 것만). 표에 고유 제약이 없어 한 문서에
 * 판이 여럿 있을 수 있다 — 지금 페이지와 맞는 것 중 가장 최근 것을 쓴다.
 *
 * 글자를 얹은 편집본은 여기서 모른다(브라우저에만 있다). 화면의 단추가 따로 남긴다.
 *
 * ── 지키는 것 ────────────────────────────────────────────────
 *
 * - 생성 라우트는 **기다리지 않는다**(`syncDocumentLibraryLater`). 생성 라우트는 **새
 *   판을 열지 않는다**(`mayFork: false`) — 섹션 몇 장만 알아서, 새 판을 열면 반쪽짜리가
 *   된다. 새 판은 페이지 전체를 아는 화면의 확인 문이 연다
 * - 같은 문서는 한 번에 하나씩, 서버 전체로는 두 개까지, 줄은 짧게(메모리 911MB)
 */

type Image = { base64: string; mimeType: string };

export interface LibrarySyncInput {
  userId: string;
  documentId: string;
  /** 지금 페이지의 섹션 차례(겹침 없음). */
  pageSectionIds: string[];
  /** 화면이 보고 있는 그림의 지문. `pageSectionIds` 와 같은 차례, 그림이 없으면 `null`. */
  pageHashes?: Array<string | null>;
  /** 서버가 바이트를 가진 그림 — 방금 만든 것 또는 화면이 보낸 것. */
  images?: Array<{ sectionId: string; image: Image }>;
  /** 맞는 작업이 없을 때 새 작업을 열어도 되나. 페이지 전체를 아는 확인 문만 연다. */
  mayFork: boolean;
  /** 처음 만들 때만 쓰는 이름. */
  title?: string;
  /** 처음 만들 때만 쓰는 「과정 보기」 내용. `workProcessOf` 를 거친 것만. */
  process?: Record<string, unknown> | null;
}

/** 맞춘 결과. 화면이 「무엇을 더 보내야 하나」를 판단하는 데 쓴다. */
export interface LibrarySyncSummary {
  /** 그림을 아는 섹션 수. */
  desired: number;
  /** 그중 작업에 **같은 그림**으로 들어가 있는 수. */
  covered: number;
  /** 그림을 아는데 작업에 없거나 다른 그림인 섹션. 화면이 한 장씩 보낸다. */
  missing: string[];
}

type LibraryRow = { position: number; path: string };
type Candidate = { itemId: string; rows: LibraryRow[] };

/** 저장소를 만지는 일. 시험이 갈아 끼운다. */
export interface LibrarySyncDeps {
  localOnly: () => boolean;
  /** 이 문서가 지워졌거나 지우는 중인가. 그러면 라이브러리에 아무것도 쓰지 않는다(3차 리뷰 W12). 없으면 묻지 않는다. */
  documentDeleted?: (userId: string, documentId: string) => Promise<boolean>;
  /** 이 문서의 라이브러리 작업들(자기 것, 가장 최근 것부터). */
  findItems: (userId: string, documentId: string) => Promise<Candidate[]>;
  create: (input: LibrarySyncInput & { fileKey: string; image: Image }) => Promise<string | null>;
  appendAt: (input: { userId: string; itemId: string; position: number; fileKey: string; image: Image }) => Promise<boolean>;
  replaceAt: (input: { userId: string; itemId: string; position: number; fileKey: string; image: Image }) => Promise<boolean>;
  /** `order[i]` 자리를 `i` 로 옮긴다. 파일은 안 건드린다. */
  reorder: (input: { userId: string; itemId: string; order: number[] }) => Promise<boolean>;
}

const MAX_CANDIDATES = 10;

/**
 * 서버 문서가 지워졌거나 지우는 중인가(`deleted_at` 이 찍히는 순간부터). 문서 기능이 꺼져 있으면
 * 문서 표를 건드리지 않는다 — 표가 없는 운영에서도 동기화는 지금처럼 돈다.
 * 이 문서 한 건만 묻는다(최종 리뷰 L4) — 회원의 지운 문서 목록 전체를 생성마다 읽지 않는다.
 *
 * 남는 틈(알고 둔 것): 이 확인과 라이브러리 쓰기 사이(워터마크·업로드, 수 초)에 문서가 지워지고 그
 * 삭제의 옛 작업 정리가 먼저 끝나면, 이번에 새로 연 작업 한 건은 숨은 채 남을 수 있다.
 */
export async function serverDocumentDeleted(userId: string, documentId: string): Promise<boolean> {
  if (!serverDocumentsEnabled()) return false;
  const { documentServices } = await import("../documents/index");
  return documentServices().repo.isDeleted(userId, documentId);
}

const defaultDeps: LibrarySyncDeps = {
  localOnly: () => isLocalStoreEnabled(),
  documentDeleted: serverDocumentDeleted,
  async findItems(userId, documentId) {
    const admin = createSupabaseAdminClient();
    const { data: items, error } = await admin
      .from("library_items")
      .select("id")
      .eq("user_id", userId)
      .eq("tool", "create")
      .eq("source_id", documentId)
      // 회원이 지운 작업은 보관 중인 자료다 — 그림을 덧붙이거나 갈아 끼우지 않는다(2026-10-08).
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_CANDIDATES);
    if (error) throw new Error(error.message);
    const ids = ((items ?? []) as Array<{ id: string }>).map((item) => item.id);
    if (!ids.length) return [];
    const { data: rows, error: rowError } = await admin
      .from("library_images")
      .select("item_id,position,path")
      .eq("user_id", userId)
      .in("item_id", ids);
    if (rowError) throw new Error(rowError.message);
    const typed = (rows ?? []) as Array<LibraryRow & { item_id: string }>;
    return ids.map((itemId) => ({
      itemId,
      rows: typed.filter((row) => row.item_id === itemId).map(({ position, path }) => ({ position, path })),
    }));
  },
  async create(input) {
    // 작업 열쇠는 늘 문서 id 다. 표에 고유 제약이 없어 한 문서에 판이 여럿일 수 있다.
    const result = await saveLibraryItem({
      userId: input.userId,
      title: input.title?.trim() || "상세페이지 작업",
      tool: "create",
      origin: "ai",
      sourceId: input.documentId,
      fileTag: input.fileKey,
      process: input.process ?? null,
      images: [input.image],
    });
    return result.ok ? result.id : null;
  },
  async appendAt(input) {
    const result = await saveLibraryItem({
      userId: input.userId,
      title: "",
      tool: "create",
      origin: "ai",
      fileTag: input.fileKey,
      appendTo: { itemId: input.itemId, startPosition: input.position },
      images: [input.image],
    });
    return result.ok;
  },
  async replaceAt(input) {
    return (await replaceLibraryImageAt({ ...input, fileTag: input.fileKey, origin: "ai" })).ok;
  },
  async reorder(input) {
    return (await reorderLibraryImages(input)).ok;
  },
};

interface PageSection extends PageEntry {
  sectionId: string;
  /** 서버가 가진 바이트. 없으면 지문만 안다 — 바꿔야 하면 화면에 달라고 한다. */
  image: Image | null;
}

/** 지금 페이지와 섹션마다 아는 그림. 바이트가 있으면 그 지문, 없으면 화면이 보낸 지문. */
function buildPage(input: LibrarySyncInput): PageSection[] {
  const bytes = new Map((input.images ?? []).map((entry) => [entry.sectionId, entry.image]));
  return input.pageSectionIds.map((sectionId, index) => {
    const image = bytes.get(sectionId) ?? null;
    const artifact = image ? artifactTag(Buffer.from(image.base64, "base64")) : input.pageHashes?.[index] ?? null;
    return { sectionId, section: sectionKey(sectionId), artifact, image };
  });
}

type Keyed = Array<{ position: number; key: ReturnType<typeof parseLibraryFileKey> }>;
const keyed = (rows: readonly LibraryRow[]): Keyed =>
  rows.map((row) => ({ position: row.position, key: parseLibraryFileKey(row.path) }));

/** 한 문서를 라이브러리 작업 하나에 맞추고, 무엇이 모자란지 돌려준다. */
export async function syncPdpDocumentToLibrary(
  input: LibrarySyncInput,
  deps: LibrarySyncDeps = defaultDeps,
): Promise<LibrarySyncSummary> {
  if (deps.localOnly()) return { desired: 0, covered: 0, missing: [] };

  const page = buildPage(input);
  const known = page.filter((entry) => entry.artifact !== null);
  // 화면이 닫혀 문서 자동저장이 끊겨도 생성 결과는 서버 라이브러리에 남긴다.
  const summarize = (inItem: Map<string, string>): LibrarySyncSummary => {
    const same = known.filter((entry) => inItem.get(entry.section) === entry.artifact);
    return {
      desired: known.length,
      covered: same.length,
      missing: known.filter((entry) => !same.includes(entry)).map((entry) => entry.sectionId),
    };
  };
  if (known.length === 0) return summarize(new Map());
  // 지운 문서의 늦은 결과로 새 작업을 열면 목록이 숨긴 채 줄과 파일만 남는다(W12).
  if (await documentGone(input, deps)) return { desired: 0, covered: 0, missing: [] };

  // 이 문서의 작업 중 **지금 페이지와 맞는** 가장 최근 것. 맞지 않는 작업은 그대로 둔다.
  const candidates = await deps.findItems(input.userId, input.documentId);
  const chosen = candidates.find((candidate) => planItemSync(keyed(candidate.rows), page).compatible);
  if (chosen) return fillItem({ input, deps, page, itemId: chosen.itemId, rows: keyed(chosen.rows), summarize });

  // 새 판을 연다. 생성 라우트는 이미 판이 있으면 열지 않는다 — 반쪽짜리가 된다.
  const first = page.findIndex((entry) => entry.image !== null);
  if (first < 0 || (!input.mayFork && candidates.length > 0)) return summarize(new Map());
  const fileKey = libraryFileKey(page[first]!.section, page[first]!.artifact as string);
  const itemId = await deps.create({ ...input, fileKey, image: page[first]!.image! });
  if (!itemId) return summarize(new Map());
  const rows = keyed([{ position: 0, path: `${input.userId}/${itemId}/0-${fileKey}.webp` }]);
  return fillItem({ input, deps, page, itemId, rows, summarize });
}

/** 지웠는지 묻는다. 확인을 못 하면 맞춘다 — 창을 닫아도 결과를 남기는 것(F11)이 먼저다. */
async function documentGone(input: LibrarySyncInput, deps: LibrarySyncDeps): Promise<boolean> {
  try {
    return (await deps.documentDeleted?.(input.userId, input.documentId)) ?? false;
  } catch (error) {
    console.warn(`[pdp-library-sync] ${input.documentId} 문서가 지워졌는지 확인하지 못해 그대로 맞춥니다`, error);
    return false;
  }
}

async function fillItem(context: {
  input: LibrarySyncInput;
  deps: LibrarySyncDeps;
  page: PageSection[];
  itemId: string;
  rows: Keyed;
  summarize: (inItem: Map<string, string>) => LibrarySyncSummary;
}): Promise<LibrarySyncSummary> {
  const { input, deps, page, itemId, rows } = context;
  const plan = planItemSync(rows, page);
  const fileKeyOf = (index: number) => libraryFileKey(page[index]!.section, page[index]!.artifact as string);

  // 작업에 들어가 있는 섹션 → 그 그림의 지문·자리. 표시 없는 줄(옛 작업)은 모른다.
  const artifactOf = new Map(rows.flatMap((row) => (row.key ? [[row.key.section, row.key.artifact] as const] : [])));
  const positionOf = new Map(rows.flatMap((row) => (row.key ? [[row.key.section, row.position] as const] : [])));

  // 바이트가 없는 섹션은 건너뛴다 — 화면이 보낼 것이다. 실패해도 예전 그림이 남는다(2차 리뷰 MEDIUM-3).
  for (const { position, index } of plan.replace) {
    const image = page[index]!.image;
    if (!image) continue;
    const ok = await deps.replaceAt({ userId: input.userId, itemId, position, fileKey: fileKeyOf(index), image });
    if (!ok) {
      console.warn(`[pdp-library-sync] ${input.documentId} ${position}번 자리를 바꾸지 못해 예전 그림을 둡니다`);
      continue;
    }
    artifactOf.set(page[index]!.section, page[index]!.artifact!);
    positionOf.set(page[index]!.section, position);
  }

  // 뒤에 붙인다 — 자리 번호는 지금 가장 큰 자리 다음부터(중간이 비어 있어도 겹치지 않게).
  let next = rows.reduce((max, row) => Math.max(max, row.position), -1) + 1;
  for (const index of plan.append) {
    const image = page[index]!.image;
    if (!image) continue;
    const ok = await deps.appendAt({ userId: input.userId, itemId, position: next, fileKey: fileKeyOf(index), image });
    if (!ok) break;
    artifactOf.set(page[index]!.section, page[index]!.artifact!);
    positionOf.set(page[index]!.section, next);
    next += 1;
  }

  /*
    페이지 차례로 옮긴다(작업의 모든 줄이 표시를 가졌을 때만 — 계획이 그때만 옮기라 한다).
    들어간 것끼리. 실패해도 그림은 다 있다, 다음에 다시 옮긴다.
  */
  if (plan.reorder) {
    const order = page.flatMap((entry) => {
      const position = positionOf.get(entry.section);
      return position === undefined ? [] : [position];
    });
    if (order.some((position, index) => position !== index)) {
      const ok = await deps.reorder({ userId: input.userId, itemId, order });
      if (!ok) console.warn(`[pdp-library-sync] ${input.documentId} 순서를 옮기지 못했습니다`);
    }
  }

  return context.summarize(artifactOf);
}

/** 줄이 가득 찼다. 확인 문은 「잠시 뒤 다시」로 답하고, 생성 라우트는 로그만 남긴다. */
export class LibrarySyncBusyError extends Error {
  constructor() {
    super("library sync queue is full");
  }
}

const running = new Map<string, Promise<unknown>>();
const pendingByKey = new Map<string, number>();
const GLOBAL_LIMIT = 2;
/**
 * 줄의 길이(돌고 있는 것 포함). 기다리는 요청은 그림 바이트를 쥐고 있다 — 한 장
 * 12MB 까지. 줄이 길면 911MB 서버가 죽는다(3차 리뷰 MEDIUM).
 */
const MAX_PENDING_TOTAL = 12;
const MAX_PENDING_PER_KEY = 3;
let pendingTotal = 0;
let active = 0;
const waiting: Array<() => void> = [];

/**
 * 자리는 **기다리던 쪽에 바로 넘긴다**(2차 리뷰 LOW-1). 풀었다가 다시 잡으면 그 틈에
 * 새로 온 쪽이 끼어들어 셋이 동시에 돈다.
 */
async function withGlobalSlot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= GLOBAL_LIMIT) await new Promise<void>((resolve) => waiting.push(resolve));
  else active += 1;
  try {
    return await run();
  } finally {
    const handOver = waiting.shift();
    if (handOver) handOver();
    else active -= 1;
  }
}

/** 줄이 가득 찼나. 확인 문이 본문을 읽기 전에 본다. */
export function libraryQueueFull(): boolean {
  return pendingTotal >= MAX_PENDING_TOTAL;
}

/**
 * 같은 열쇠(회원·문서)의 일을 **차례로** 돌린다. 서버 전체로는 두 개까지만 동시에.
 * 앞의 것이 실패해도 뒤의 것은 돈다. 줄이 가득 차면 `LibrarySyncBusyError` 로 거절한다.
 */
export function scheduleLibrarySync<T>(key: string, run: () => Promise<T>): Promise<T> {
  const mine = pendingByKey.get(key) ?? 0;
  if (pendingTotal >= MAX_PENDING_TOTAL || mine >= MAX_PENDING_PER_KEY) return Promise.reject(new LibrarySyncBusyError());
  pendingTotal += 1;
  pendingByKey.set(key, mine + 1);

  const previous = running.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => withGlobalSlot(run));
  running.set(key, next);
  void next.finally(() => {
    pendingTotal -= 1;
    const left = (pendingByKey.get(key) ?? 1) - 1;
    if (left > 0) pendingByKey.set(key, left);
    else pendingByKey.delete(key);
    if (running.get(key) === next) running.delete(key);
  }).catch(() => undefined);
  return next;
}

/** 생성 라우트가 부르는 문. 기다리지 않는다 — 실패는 로그로만. 새 판은 열지 않는다. */
export function syncDocumentLibraryLater(input: Omit<LibrarySyncInput, "mayFork">): Promise<void> {
  const job = { ...input, mayFork: false };
  return scheduleLibrarySync(`${input.userId}:${input.documentId}`, () => syncPdpDocumentToLibrary(job))
    .then(() => undefined)
    .catch((error) => console.error(`[pdp-library-sync] ${input.documentId} 라이브러리에 맞추지 못했습니다`, error));
}

/** 화면이 확인하러 부르는 문(`/api/pdp/library-sync`). 끝날 때까지 기다려 결과를 준다. */
export function syncDocumentLibraryNow(input: Omit<LibrarySyncInput, "mayFork">): Promise<LibrarySyncSummary> {
  const job = { ...input, mayFork: true };
  return scheduleLibrarySync(`${input.userId}:${input.documentId}`, () => syncPdpDocumentToLibrary(job));
}
