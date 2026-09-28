import { workProcessOf } from "../../../app/api/library/work-process";
import { sniffImageMime } from "../../image-encoding";
import { artifactTag } from "./library-sync-plan";
import type { LibrarySyncInput } from "./library-sync";

/**
 * 요청에서 **라이브러리 맞추기에 쓸 값**만 골라낸다(생성 라우트 둘과 확인 문이 함께 쓴다).
 *
 * - 문서 id 가 없거나 uuid 가 아니면 `null` — 묶을 열쇠가 없다. `library_items.source_id`
 *   칸이 uuid 다
 * - **페이지 차례(`pageSectionIds`)가 없으면 `null`**(3차 리뷰 MEDIUM). 전에는 서버가 기록한
 *   섹션 전부로 차례를 지어, 지운 섹션까지 한 작업에 섞였다. 배포 중에 옛 화면이 보낸
 *   요청이 그렇다 — 맞추지 않는다
 * - **차례에 같은 섹션 id 가 두 번 오면 맞추지 않는다**(4차 리뷰 LOW). 예전 초안은 AI 가
 *   준 id(`S1`…)를 그대로 써서 겹칠 수 있다 — 두 섹션이 한 자리를 나눠 써 한 장이 빠진
 *   채 「저장됨」이 됐다. 그런 초안은 화면이 예전처럼 직접 올린다(`hasDuplicateSections`)
 * - 이름은 200자, 과정은 `workProcessOf` 를 거친 것만 — 화면이 보낸 것을 그대로 담지 않는다
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{8}$/;
const MAX_SECTIONS = 30;

type SyncRequest = Omit<LibrarySyncInput, "mayFork">;

export function librarySyncFromBody(userId: string, body: Record<string, unknown>): SyncRequest | null {
  const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
  if (!UUID_RE.test(documentId)) return null;

  const ids = body.pageSectionIds;
  const validIds =
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= MAX_SECTIONS &&
    ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 120);
  if (!validIds || hasDuplicateSections(body)) return null;
  const pageSectionIds = ids as string[];

  const title = typeof body.libraryTitle === "string" ? body.libraryTitle.trim().slice(0, 200) : undefined;

  const raw = body.libraryProcess && typeof body.libraryProcess === "object" ? (body.libraryProcess as Record<string, unknown>) : null;
  const process = raw
    ? workProcessOf({
        blueprint: raw.blueprint as never,
        review: raw.review,
        aspectRatio: typeof raw.aspectRatio === "string" ? raw.aspectRatio : undefined,
      })
    : null;

  return {
    userId,
    documentId,
    pageSectionIds,
    ...(title ? { title } : {}),
    process: (process as Record<string, unknown> | null) ?? null,
  };
}

/** 차례에 같은 섹션 id 가 두 번 이상 있나. 확인 문은 이때 「맞출 수 없음」으로 답한다. */
export function hasDuplicateSections(body: Record<string, unknown>): boolean {
  const ids = body.pageSectionIds;
  return Array.isArray(ids) && new Set(ids).size !== ids.length;
}

/** 화면이 보낸 한 장의 크기 한도(base64 글자 수). 앞단이 요청을 16MB 에서 자른다. */
const MAX_SUPPLIED_BASE64 = 12_000_000;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * 확인 문(`/api/pdp/library-sync`)의 요청. 생성 라우트와 같은 값에 더해
 *
 * - **화면이 보고 있는 그림의 지문**(`pageSectionHashes`, 섹션마다 8자리 또는 `null`) —
 *   반드시 있어야 한다. 서버는 이것과 작업의 그림을 맞춰 본다(3차 리뷰 HIGH)
 * - 화면이 보낸 **한 섹션의 그림**(`supplied`) — 지금 페이지에 있는 섹션, 한 번에 한 장,
 *   12MB(base64) 까지, **바이트가 실제 png·jpeg·webp** 여야 한다(3차 리뷰 LOW)
 *
 * 형식이 틀리면 `null`(400) — 조용히 버리면 화면이 넣은 줄 안다.
 */
export function libraryConfirmFromBody(userId: string, body: Record<string, unknown>): SyncRequest | null {
  const input = librarySyncFromBody(userId, body);
  if (!input) return null;

  const hashes = body.pageSectionHashes;
  const validHashes =
    Array.isArray(hashes) &&
    hashes.length === input.pageSectionIds.length &&
    hashes.every((value) => value === null || (typeof value === "string" && HASH_RE.test(value)));
  if (!validHashes) return null;
  const pageHashes = hashes as Array<string | null>;

  if (body.supplied === undefined) return { ...input, pageHashes };

  const raw = body.supplied && typeof body.supplied === "object" ? (body.supplied as Record<string, unknown>) : null;
  const sectionId = typeof raw?.sectionId === "string" ? raw.sectionId : "";
  const base64 = typeof raw?.base64 === "string" ? raw.base64 : "";
  const shaped =
    input.pageSectionIds.includes(sectionId) &&
    base64.length > 0 &&
    base64.length <= MAX_SUPPLIED_BASE64 &&
    BASE64_RE.test(base64);
  if (!shaped) return null;
  // 적힌 형식은 믿지 않는다. 바이트를 본다 — 머리 몇 바이트면 된다(12MB 를 통째로 풀지 않는다).
  const mimeType = sniffImageMime(Buffer.from(base64.slice(0, 24), "base64"), "");
  if (!mimeType) return null;
  /*
    **그림이 화면이 말한 지문과 같아야 한다**(4차 리뷰 MEDIUM). 다르면 화면이 옛 그림을
    보낸 것이다 — 받으면 서버가 넣은 새 그림을 옛 것으로 되돌린다.
  */
  const claimed = pageHashes[input.pageSectionIds.indexOf(sectionId)];
  if (claimed && claimed !== artifactTag(Buffer.from(base64, "base64"))) return null;
  return { ...input, pageHashes, images: [{ sectionId, image: { base64, mimeType } }] };
}
