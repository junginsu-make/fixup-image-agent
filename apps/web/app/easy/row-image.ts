/**
 * **그림 줄마다 제 그림** (2026-10-06 「쉽게」 이미지 고치기).
 *
 * ── 왜 필요해졌나 ────────────────────────────────────────────
 *
 * 2026-10-06 사용자 — 「쉽게 모드에서는 최종 마지막 대화 또는 결과물에서 계속
 * 이어서 작업이 되어야 합니다.」 고치기는 포스터의 「이 장만 고치기」를 그대로
 * 부르고, 그 길은 **같은 작업 안에** 그림을 하나 더 만든다.
 *
 * 그런데 대화 줄은 작업 번호(`work_id`)만 들고 있다. 작업 하나에 그림이 여러
 * 장이 되면 「골라 둔 것, 없으면 첫 장」 규칙으로는 **원본 줄과 고친 줄이 같은
 * 그림**을 보인다.
 *
 * ── 표를 바꾸지 않는다 ──────────────────────────────────────
 *
 * 고친 줄의 글 칸에 「어느 요청의 결과인가」를 적는다. 그림 줄의 글은 화면에
 * 그려지지 않고(`message.tsx`), 판단 모델에게도 고정 문장으로 바뀌어 간다
 * (`chat.ts`). 칸을 새로 만들면 운영 DB 에 손으로 SQL 을 돌려야 한다.
 *
 * **처음 만든 줄은 지금처럼 빈 글이다.** 고친 줄이 없는 대화는 예전 규칙 그대로
 * 고른다 — 이미 있는 대화가 다르게 보이면 안 된다.
 */

const 고친줄머리 = "edit-request:";
const 넣은사진머리 = ";added=";

/**
 * **받을 정보**(2026-10-06 설계 B3). 그림 줄 글 **끝**에 붙인다 — 고친 줄 표시 뒤다.
 * 다시 열 때 그림이 아직 없으면 이것으로 `status` 에 물어 이어 받는다. 칸마다
 * `encodeURIComponent` 로 감싸 쉼표 · 쌍반점이 섞이지 않는다.
 */
const 일감머리 = ";job=";

/** `status` 라우트가 그대로 받는 셋. */
export interface EasyRowJob {
  requestRowId: string;
  falRequestId: string;
  endpoint: string;
}

/** 받을 정보 앞부분(고친 줄 표시 · 빈 글). */
function 앞부분(body: string): string {
  const at = body.indexOf(일감머리);
  return at < 0 ? body : body.slice(0, at);
}

/** 줄 글 끝에 받을 정보를 붙인다. 셋 중 하나라도 없으면 붙이지 않는다(옛 응답). */
export function withRowJob(body: string, job: Partial<EasyRowJob> | undefined): string {
  const parts = [job?.requestRowId, job?.falRequestId, job?.endpoint];
  if (!parts.every((part): part is string => typeof part === "string" && part.length > 0)) return body;
  return `${body}${일감머리}${parts.map(encodeURIComponent).join(",")}`;
}

/** 줄 글의 받을 정보. 없거나 깨졌으면 비어 있다. */
export function rowJobOf(body: string | null | undefined): EasyRowJob | undefined {
  const at = body?.indexOf(일감머리) ?? -1;
  if (at < 0) return undefined;
  try {
    const parts = body!.slice(at + 일감머리.length).split(",").map((part) => decodeURIComponent(part));
    if (parts.length !== 3 || parts.some((part) => !part)) return undefined;
    const [requestRowId, falRequestId, endpoint] = parts as [string, string, string];
    return { requestRowId, falRequestId, endpoint };
  } catch {
    return undefined;
  }
}

/**
 * 고친 줄에 남길 글.
 *
 * **그때 넣은 사진도 적는다**(2026-10-06 독립 리뷰). 화면의 첨부는 보낸 뒤에도
 * 남아 있어서, 적어 두지 않으면 앞서 넣은 로고가 다음 고치기마다 또 들어간다.
 */
export function editRowBody(requestRowId: string, addedIds: readonly string[] = []): string {
  return addedIds.length
    ? `${고친줄머리}${requestRowId}${넣은사진머리}${addedIds.join(",")}`
    : `${고친줄머리}${requestRowId}`;
}

/** 고친 줄이면 그 요청 번호. 처음 만든 줄이면 비어 있다. */
export function editRequestOf(body: string | null | undefined): string | undefined {
  const core = 앞부분(body ?? "");
  if (!core.startsWith(고친줄머리)) return undefined;
  const id = core.slice(고친줄머리.length).split(넣은사진머리)[0]!.trim();
  return id || undefined;
}

/** 고친 줄이 넣은 사진. */
export function editAddedOf(body: string | null | undefined): string[] {
  if (!editRequestOf(body)) return [];
  const [, added = ""] = 앞부분(body!).split(넣은사진머리);
  return added.split(",").map((id) => id.trim()).filter(Boolean);
}

/**
 * 결과를 받을 때 고를 그림 — **이번 요청이 만든 것**(2026-10-06 독립 리뷰).
 *
 * `status` 는 작업의 그림을 전부 오래된 차례로 준다. 화면이 첫 장을 고르면
 * 고친 결과 자리에 **원본**이 뜬다 — 값은 나갔는데 안 바뀐 것으로 보인다.
 * 처음 만들기는 그림이 이번 요청 것뿐이라 결과가 예전과 같다.
 *
 * **맞는 것이 없으면 비운다**(2026-10-06 재리뷰). 고치기가 0장으로 끝났을 때 첫 장으로
 * 떨어지면 원본이 고친 자리에 뜬다. 요청 번호를 안 싣는 옛 응답일 때만 첫 장이다.
 */
export function pickCollectedImage<T extends { generationRequestId?: string }>(
  images: readonly T[] | undefined,
  requestRowId: string,
): T | undefined {
  const mine = images?.find((image) => image.generationRequestId === requestRowId);
  if (mine) return mine;
  return images?.some((image) => image.generationRequestId) ? undefined : images?.[0];
}

/**
 * 고친 줄이 이 시간이 지나도 그림이 없으면 **실패한 것**으로 본다.
 *
 * 고치기는 보통 30초~2분이다(정밀형 플러스가 가장 느려 1분 반). 넉넉히 잡는다 —
 * 짧으면 아직 만드는 중인 것을 버리고 앞 그림을 또 고친다.
 */
const 실패로볼시간 = 10 * 60 * 1000;

/**
 * 이 작업에서 **고칠 그림**(2026-10-06 독립 리뷰).
 *
 * 마지막 줄의 그림이 기본이다. 그 줄이 고친 줄인데 그림이 없으면 —
 * 아직 만드는 중이면 기다리라고 하고, 오래 지났으면(실패 · 내용 검사 거절)
 * **그 앞의 그림으로 거슬러 간다.** 안 그러면 한 번 실패한 뒤로는 영영
 * 「준비되지 않았습니다」만 나온다.
 */
export function editTargetImage<T extends { generationRequestId: string; selected: boolean }>(
  rows: ReadonlyArray<{ role: string; workId?: string | null; body?: string | null; createdAt?: string }>,
  projectId: string,
  projectImages: readonly T[],
  now: number,
): { image: T } | { pending: true } | { none: true } {
  const edited = editedRequestIds(rows, projectId);
  const mine = rows.filter((row) => row.role === "image" && row.workId === projectId);
  for (const row of [...mine].reverse()) {
    const image = pickRowImage(row, projectImages, edited);
    if (image) return { image };
    const at = Date.parse(row.createdAt ?? "");
    const 만드는중 = Boolean(editRequestOf(row.body)) && (!Number.isFinite(at) || now - at < 실패로볼시간);
    if (만드는중) return { pending: true };
  }
  return { none: true };
}

/** 대화 줄 가운데 이 작업을 고친 요청 번호들. */
export function editedRequestIds(
  rows: ReadonlyArray<{ role: string; workId?: string | null; body?: string | null }>,
  projectId: string,
): Set<string> {
  const ids = rows
    .filter((row) => row.role === "image" && row.workId === projectId)
    .map((row) => editRequestOf(row.body))
    .filter((id): id is string => Boolean(id));
  return new Set(ids);
}

/**
 * 이 줄에 보일 그림.
 *
 * - 고친 줄: 그 요청이 만든 그림. 아직 안 왔으면 **비운다** — 다른 그림을 대신
 *   보이면 사용자는 고친 것이 안 먹혔다고 읽는다.
 * - 처음 만든 줄: 고친 그림을 뺀 나머지에서 골라 둔 것, 없으면 첫 장(예전 규칙).
 */
export function pickRowImage<T extends { generationRequestId: string; selected: boolean }>(
  row: { body?: string | null },
  projectImages: readonly T[],
  editedRequests: ReadonlySet<string>,
): T | undefined {
  const request = editRequestOf(row.body);
  if (request) return projectImages.find((image) => image.generationRequestId === request);
  const originals = projectImages.filter((image) => !editedRequests.has(image.generationRequestId));
  return originals.find((image) => image.selected) ?? originals[0];
}
