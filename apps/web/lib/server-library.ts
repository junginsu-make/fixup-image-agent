import {serverDocumentsEnabled} from "./pdp/documents/flags";
import {parseLibraryFileKey} from "./pdp/jobs/library-sync-plan";
import {legacyRowHidden} from "../app/library/document-works";
import { createSupabaseAdminClient } from "./supabase/admin";
import { inOwnerFolder, onlyInOwnerFolder } from "./storage/owner-folder";
import { scopedRead, type ViewScope } from "./teams/scope";
import { isLocalStoreEnabled } from "./local-store";
import { encodeForStorage, makeThumbnail, sniffImageMime } from "./image-encoding";
import { markAsAi } from "./watermark";
import { appendDecision } from "./library-append";
import { randomUUID } from "node:crypto";

/** 같은 자리에 다른 요청이 먼저 붙였다. 되돌린 뒤 「어긋남」으로 답하려고 구별한다. */
class PositionTakenError extends Error {}
import type { UserRole } from "./membership/types";
import { hasFullScope, ownerFilter, type ScopeAction } from "./access/core";

/**
 * 사용자별 서버 라이브러리.
 *
 * 지금까지 결과물은 브라우저 IndexedDB 에만 있었다. 다른 기기에서 안 보이고,
 * 한 PC 를 두 사람이 쓰면 서로의 작업물이 보이고, 브라우저 데이터를 지우면
 * 전부 사라졌다. 크레딧을 써서 만든 결과가 브라우저 청소 한 번에 없어졌다.
 *
 * 이미지는 Storage 버킷 'library' 에, 메타데이터만 테이블에 둔다. 섹션 이미지
 * 한 장이 2~5MB라 base64 로 행에 넣으면 목록 조회조차 느려진다.
 *
 * 경로는 `{user_id}/{item_id}/{position}-{요청표시}.{ext}` 다. 첫 칸이 소유자라
 * Storage 정책이 경로만 보고 판정한다 — 조인하다 실수할 여지를 없앤다.
 *
 * **여기서 읽고 쓰는 것은 전부 admin 클라이언트다.** 그러므로 RLS 는 이 길에
 * 관여하지 않고, 남의 것을 못 보게 막는 실제 방어선은 아래 질의 조건이다.
 * 조건 하나를 빠뜨리면 그 순간 전부 새 나간다 — 그래서 조건을 만드는 곳을
 * `libraryScope` 한 군데로 모았다.
 */

const BUCKET = "library";
/** 파일 이름에 새길 수 있는 표시: 8자리 16진수, 또는 `s<섹션>-a<그림>`(8자리씩). */
const FILE_TAG_RE = /^(?:[0-9a-f]{8}|s[0-9a-f]{8}-a[0-9a-f]{8})$/;

/**
 * 파일 이름에 쓸 조각. 섹션·그림 표시(`s…-a…`)에는 **요청마다 무작위 조각을 더 붙인다**
 * (독립 리뷰 LOW-2) — 같은 그림을 두 요청이 겹쳐 올려도 이름이 달라, 늦게 실패한 쪽이
 * 되돌리며 먼저 성공한 쪽의 파일을 지우지 않는다.
 */
function fileStemTag(fileTag: string | undefined): string {
  if (!fileTag || !FILE_TAG_RE.test(fileTag)) return randomUUID().slice(0, 8);
  return fileTag.startsWith("s") ? `${fileTag}-${randomUUID().slice(0, 6)}` : fileTag;
}
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** 목록을 보는 사람. 클라이언트가 보낸 값이 아니라 세션에서 꺼낸 것만 넣는다. */
export interface LibraryViewer {
  userId: string;
  role: UserRole;
  /**
   * 지금 고른 프로젝트. 있으면 그 갈래만 보인다.
   *
   * **없으면 「전체」다.** 안 거는 쪽이 기본이라, 빠뜨렸을 때 화면이 비지 않는다.
   */
  projectId?: string | null;
  /**
   * 이 사람의 팀. 있으면 같은 팀 것이 함께 보인다.
   *
   * 없어도 되게 둔 것은, 팀을 모르는 자리에서 부르면 **개인으로 취급**되어
   * 지금까지와 같게 동작하기 때문이다. 빠뜨렸을 때 남의 것이 보이는 쪽으로
   * 틀리지 않는다.
   */
  teamId?: string | null;
}

/** 읽기 범위. 팀이 있으면 팀 것까지, 없으면 내 것만, 운영자는 전부. */
function readScope(viewer: LibraryViewer): ViewScope {
  return {
    userId: viewer.userId,
    teamId: viewer.teamId ?? null,
    isAdmin: hasFullScope(viewer, "read"),
  };
}

/**
 * 이 사람의 질의에 걸 소유자 조건. 조건이 필요 없으면 `undefined` 다.
 *
 * **판단 자체는 `lib/access/core.ts` 가 한다.** 여기 있던 규칙을 그리로
 * 옮겼다 — 같은 질문("관리자는 남의 것을 볼 수 있나")을 열다섯 군데가 각자
 * 답하다가 어긋난 적이 있다. 이 함수는 이름만 남겨 부르는 쪽을 안 건드린다.
 *
 * 관리자는 보기도 지우기도 전체가 열린다. 무거운 일이라는 사실은 그대로라,
 * 화면은 지우기 전에 한 번 더 묻고 누가 만든 것인지를 함께 보여준다.
 *
 * **`export` 만 다르다 — 전체가 열린 사람도 자기 것만이다.** 판단은
 * `access/core.ts` 가 한다(거기 머리말에 근거를 적었다).
 */
export function libraryScope(viewer: LibraryViewer, action: ScopeAction): string | undefined {
  return ownerFilter(viewer, action);
}

export interface LibraryImageInput {
  base64: string;
  mimeType: string;
}

export type LibrarySourceType = "generation" | "character";

/** 무엇으로 만들었나. 광고소재는 2026-10-08 부터 저장한다(`202610080001_library_ad_tool.sql`). */
export type LibraryTool = "create" | "redesign" | "ad";

/** 받은 그대로(`asIs`) 넣을 수 있는 형식. 광고 규격은 JPG·PNG 뿐이다. */
const AS_IS_FORMATS = new Set(["image/png", "image/jpeg"]);

/**
 * 이 회원이 `since` 뒤로 이 도구로 남긴 작업 수.
 *
 * 광고 내보내기는 자르기만 하면 0크레딧이라 장부가 막지 않는데, 뽑을 때마다 라이브러리에 한
 * 묶음이 영구로 쌓인다. 그 저장에 상한을 거는 데 쓴다(2026-10-08 보안 리뷰). **못 세면 던진다** —
 * 부르는 쪽이 저장하지 않는 쪽으로 닫는다.
 */
export async function countRecentLibraryItems(userId: string, tool: LibraryTool, since: Date): Promise<number> {
  if (isLocalStoreEnabled()) return 0;
  const { count, error } = await createSupabaseAdminClient()
    .from("library_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("tool", tool)
    .gte("created_at", since.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * 이 그림을 AI 가 만들었는가.
 *
 * `/api/library` 로는 두 가지가 들어온다 — 도구가 만든 결과와, 사용자가
 * 라이브러리 화면에서 직접 고른 파일이다. 표기는 **AI 가 만든 것에만**
 * 붙어야 한다. 사용자가 찍은 사진에 "AI 이미지" 를 새겨 돌려주면 그것은
 * 사실이 아닌 표기다.
 */
export type LibraryOrigin = "ai" | "upload";

export interface SaveLibraryItemInput {
  userId: string;
  title: string;
  tool: LibraryTool;
  /** 기본값을 두지 않는다. 부르는 쪽이 매번 정하게 해야 나중에 빠지지 않는다. */
  origin: LibraryOrigin;
  /**
   * **받은 바이트 그대로 넣는다**(2026-10-08, 광고소재). 표기를 새기지 않고 저장 형식도 바꾸지 않는다.
   *
   * 광고 규격은 크기·형식·용량이 곧 규격이고, AI 표기는 내보낼 때 이미 새겼다(`lib/ad/finish.ts`).
   * WebP 로 바꾸면 라이브러리에서 내려받은 파일을 광고 매체가 안 받고, 또 새기면 표기가 두 번 찍힌다.
   */
  asIs?: boolean;
  aspectRatio?: string;
  /** 같은 결과물이 전용 목록에도 있을 때 선택창에서 중복되지 않게 구분한다. */
  sourceType?: LibrarySourceType;
  /** 전용 원본의 id. 원본을 지워도 라이브러리 결과물은 보존하므로 FK로 묶지 않는다. */
  sourceId?: string;
  images: LibraryImageInput[];
  /**
   * 이 작업을 **무엇으로 만들었는지**. 라이브러리의 「과정 보기」가 읽는다.
   *
   * 무엇을 담는지는 여기가 정하지 않는다 — `app/api/library/work-process.ts`
   * 한 곳이 정하고, 이 표는 「json 한 칸」까지만 안다. 담을 것이 늘 때마다
   * 저장 코드를 따라 고치지 않기 위해서다.
   *
   * 없으면 `null` 이다. `{}` 로 두면 과정이 남기 전에 만든 옛 작업과
   * 구분되지 않아 화면이 빈 상자를 그린다.
   */
  process?: Record<string, unknown> | null;
  /**
   * 이미 있는 작업에 **이어 붙일 때**만 준다.
   *
   * 리디자인이 섹션을 한 장씩 만드는데, 장마다 새 작업을 만들면 목록에 같은
   * 페이지가 여덟 줄로 흩어진다. `saveOrAppendLibraryItem` 이 채워 준다.
   */
  appendTo?: { itemId: string; startPosition: number };
  /**
   * 파일 이름에 새길 표시. 안 주면 요청마다 새로 짓는다.
   *
   * 서버가 상세페이지를 직접 등록할 때 **어느 섹션의 어느 그림인지**(`s<섹션>-a<그림>`,
   * 16진수 8자리씩) 새긴다(`pdp/jobs/library-sync.ts`). 다음에 맞춰 볼 때 같은
   * 섹션의 바뀐 자리만 다시 올린다.
   */
  fileTag?: string;
}

export interface ServerLibraryItem {
  id: string;
  title: string;
  tool: LibraryTool;
  aspectRatio: string | null;
  sourceType: LibrarySourceType;
  sourceId: string | null;
  imageCount: number;
  createdAt: string;
  /** 목록용 표지. 서명 URL 이라 수명이 있다. */
  coverUrl: string | null;
  /** 목록 카드가 쓰는 작은 사본. 없으면 `coverUrl` 로 떨어진다. */
  coverThumbUrl: string | null;
  /** 내가 만든 것인가. 관리자 목록에서 남의 것과 구분하는 데 쓴다. */
  mine: boolean;
  /** 누가 만들었는가. **관리자에게만** 채운다 — 회원끼리 이메일이 보이면 안 된다. */
  ownerEmail: string | null;
  documentId?:string;
  documentOwner?:string;
  imageTags?:string[];
  /** 문서 카드만, 서버 안에서만: 문서가 가졌던 그림 지문. 연결된 옛 그림을 보일지 정한다(`legacyRowHidden`). 응답에는 싣지 않는다. */
  heldImageTags?:string[];
}

/** createSignedUrls 는 항목마다 실패할 수 있다. 실패한 것은 버린다. */
function toUrlMap(entries: Array<{ path: string | null; signedUrl: string | null }> | null) {
  const map = new Map<string, string>();
  for (const entry of entries ?? []) {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  }
  return map;
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

/**
 * 바이트를 보고 형식을 정한다. 정의는 `image-encoding` 에 있다.
 *
 * 확장자와 content-type 은 부르는 쪽이 알려준 값이라, 그대로 쓰면 `.jpg` 라는
 * 이름의 PNG 가 `image/jpeg` 로 저장된다. 브라우저가 못 여는 파일이 된다.
 * 그래서 **올리기 직전 실제 바이트를 보고** 정한다.
 *
 * 인코딩과 같은 파일에 둔 것은, 저장할 바이트를 정하는 쪽과 그 바이트가
 * 무엇인지 말하는 쪽이 갈라지면 언젠가 서로 다른 답을 내기 때문이다.
 */
export { sniffImageMime };

/**
 * 결과물 한 건을 저장한다.
 *
 * 이미지를 먼저 올리고 메타데이터를 쓴다. 중간에 실패하면 올라간 파일을 지운다 —
 * 목록에 없는데 용량만 차지하는 파일이 남는 것이 가장 나쁘다.
 *
 * AI 가 만든 것이면 올리기 직전에 "AI 이미지" 를 새긴다. 상세페이지와
 * 리디자인은 그림을 만든 자리가 서로 다르지만 저장은 여기 하나로 모이므로,
 * 여기 한 번 걸어 두면 두 도구가 함께 덮인다. 표기가 실패해도 원본이
 * 돌아오므로 그림을 잃지는 않는다.
 */
export async function saveLibraryItem(input: SaveLibraryItemInput) {
  if (input.images.length === 0) {
    return { ok: false as const, message: "저장할 이미지가 없습니다." };
  }
  /*
    **받은 그대로 넣는 길은 그림만 받는다**(2026-10-08 보안 리뷰). 다시 굽지 않으므로 바이트가
    무엇인지 여기서밖에 못 본다. 형식을 모르면 딱지만 믿고 넣는 대신 거절한다.
  */
  if (input.asIs && input.images.some((image) => !AS_IS_FORMATS.has(sniffImageMime(Buffer.from(image.base64, "base64"), "")))) {
    return { ok: false as const, message: "저장할 수 없는 파일입니다." };
  }

  const supabase = createSupabaseAdminClient();

  /**
   * **이미 있는 작업에 이어 붙이는 길.**
   *
   * 리디자인은 섹션을 한 장씩 만든다. 장마다 새 작업을 만들면 목록에 같은
   * 페이지가 여덟 줄로 흩어진다. 그래서 이어 붙인다 — 자리 번호는 이미 있는
   * 것 다음부터다.
   */
  const appendTo = input.appendTo;
  const startPosition = appendTo?.startPosition ?? 0;

  const item = appendTo
    ? { id: appendTo.itemId }
    : await (async () => {
        const { data, error } = await supabase
          .from("library_items")
          .insert({
            user_id: input.userId,
            title: input.title.slice(0, 200),
            tool: input.tool,
            aspect_ratio: input.aspectRatio ?? null,
            source_type: input.sourceType ?? "generation",
            source_id: input.sourceId ?? null,
            image_count: input.images.length,
            // 과정은 **만들 때 한 번만** 담는다. 이어 붙일 때(`appendTo`) 다시
            // 쓰지 않는다 — 리디자인은 섹션마다 부르는데, 매번 덮으면 마지막
            // 섹션이 보던 기획안이 작업 전체의 과정이 되어 버린다.
            data: input.process ?? null,
          })
          .select("id")
          .single();
        return error || !data ? { id: "", error: error?.message } : (data as { id: string });
      })();

  if (!item.id) {
    /*
      **PostgREST 문구를 그대로 올려 보내지 않는다.** 라우트가 이 값을
      `result.ok === false` 경로로 그대로 화면에 싣는다 — 라우트의 `catch` 만
      막으면 이 길로 샌다. 칼럼이 없을 때의 `PGRST204` 가 표·칼럼 이름을
      통째로 들고 나가는 것이 그 예다.
    */
    if ("error" in item && item.error) console.error("[library:create]", item.error);
    return { ok: false as const, message: "저장하지 못했습니다." };
  }

  const uploaded: string[] = [];
  let coverThumbPath: string | null = null;
  /*
    **요청마다 파일 이름을 다르게 한다**(2차 독립 리뷰 HIGH).

    같은 작업에 두 요청이 겹치면(탭 두 개, 다시 그려진 편집기) 둘 다 같은
    자리 번호를 쓴다. 이름이 같으면 늦은 쪽이 실패해 되돌릴 때 **먼저 성공한
    쪽의 파일을 지운다** — 목록은 「저장됨」인데 그림이 없다. 경로는 표
    (`library_images.path`)에 적혀 읽히므로 이름 규칙에 기대는 곳이 없다.
  */
  const batchTag = fileStemTag(input.fileTag);

  try {
    const rows = [];
    for (const [offset, image] of input.images.entries()) {
      const position = startPosition + offset;
      const original = Buffer.from(image.base64, "base64");
      const { bytes, mimeType } = input.asIs
        ? { bytes: original, mimeType: sniffImageMime(original, image.mimeType) }
        // 표기까지 새긴 뒤에 줄인다. 표기가 픽셀을 바꾸므로 순서가 뒤바뀌면
        // 줄여 놓은 것을 다시 부풀린 채로 저장하게 된다.
        : await encodeForStorage(input.origin === "ai" ? await markAsAi(original) : original, image.mimeType);

      const path = `${input.userId}/${item.id}/${position}-${batchTag}.${extensionFor(mimeType)}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: mimeType, upsert: true });
      if (error) throw new Error(error.message);

      uploaded.push(path);

      // 목록에 걸 작은 사본. **못 만들어도 저장을 막지 않는다** — 목록이
      // 조금 무거운 것보다 결과물을 잃는 것이 훨씬 나쁘다.
      // **원본보다 작을 때만 둔다.** 이미 작은 그림은 512px 로 줄여도 오히려
      // 커질 수 있다 — 그때는 사본이 자리만 차지하고 목록도 더 느려진다.
      // 저장 인코딩과 같은 규칙이라, 여기서도 용량이 느는 일이 없다.
      const candidate = await makeThumbnail(bytes);
      const thumbnail = candidate && candidate.length < bytes.length ? candidate : null;
      let thumbPath: string | null = null;
      if (thumbnail) {
        thumbPath = `${input.userId}/${item.id}/${position}-${batchTag}.thumb.webp`;
        const { error: thumbError } = await supabase.storage
          .from(BUCKET)
          .upload(thumbPath, thumbnail, { contentType: "image/webp", upsert: true });
        if (thumbError) {
          // 사본 하나 때문에 되돌리지 않는다. 없으면 화면이 원본으로 떨어진다.
          console.error(`[library] 작은 사본을 올리지 못했습니다: ${thumbError.message}`);
          thumbPath = null;
        } else {
          // **되돌릴 목록에 넣는다.** 안 넣으면 저장이 엎어졌을 때 아무도
          // 못 찾는 파일이 용량만 차지한 채 남는다.
          uploaded.push(thumbPath);
        }
      }

      if (position === 0) coverThumbPath = thumbPath;

      rows.push({
        item_id: item.id,
        user_id: input.userId,
        position,
        path,
        mime_type: mimeType,
        thumb_path: thumbPath,
      });
    }

    const { error: imagesError } = await supabase.from("library_images").insert(rows);
    if (imagesError) {
      // 같은 자리에 다른 요청이 먼저 붙였다. 내 파일만 되돌리고 「어긋남」으로 답한다.
      if (imagesError.code === "23505") throw new PositionTakenError();
      throw new Error(imagesError.message);
    }

    /**
     * 표지는 **첫 장일 때만** 정한다. 이어 붙일 때 덮으면 두 번째 섹션이
     * 표지가 되어, 목록에서 페이지가 중간부터 시작하는 것처럼 보인다.
     */
    /*
      이어 붙였으면 **장수는 행을 센다**(4차 리뷰 LOW). 자리 번호로 셈하면, 자리를 옮기다
      멈춰 멀리 선 줄(100000 번대)이 있을 때 장수가 십만이 된다.
    */
    let appendedCount = startPosition + rows.length;
    if (appendTo) {
      const { count, error: rowCountError } = await supabase
        .from("library_images")
        .select("id", { count: "exact", head: true })
        .eq("item_id", item.id);
      if (!rowCountError && typeof count === "number") appendedCount = count;
    }
    const { error: countError } = await supabase
      .from("library_items")
      .update(
        appendTo
          ? { image_count: appendedCount }
          : {
              cover_path: rows[0]?.path ?? null,
              cover_thumb_path: coverThumbPath,
              image_count: rows.length,
            },
      )
      .eq("id", item.id);
    // 그림과 행은 들어갔다. 장수는 이어 붙일 때 행을 직접 세므로(`findLibraryItemBySource`)
    // 여기서 실패해도 되돌리지 않는다 — 되돌리면 멀쩡히 저장된 것을 잃는다.
    if (countError) console.error("[library:count]", countError.message);

    return { ok: true as const, id: item.id as string, imageCount: rows.length };
  } catch (error) {
    // 되돌린다. 파일부터 지우고 행을 지운다 — 순서가 반대면 경로를 잃는다.
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    /**
     * **이어 붙이다 실패했으면 작업 자체는 지우지 않는다.** 앞서 저장된
     * 섹션들이 그 안에 있다. 이번에 올리던 것만 되돌린다.
     */
    if (!appendTo) await supabase.from("library_items").delete().eq("id", item.id);
    if (error instanceof PositionTakenError) {
      return { ok: false as const, conflict: true, message: "다른 곳에서 먼저 저장했습니다. 다시 눌러 주세요." };
    }
    /*
      **DB·저장소 문구를 화면에 흘리지 않는다.** 제약·표 이름이 그대로 나간다
      (`route.ts` 와 같은 원칙). 로그에만 남긴다.
    */
    console.error("[library:save-item]", error);
    return { ok: false as const, message: "저장 중 오류가 발생했습니다." };
  }
}

/**
 * 작업의 **한 자리를 새 그림으로 바꾼다**(서버가 상세페이지를 맞출 때).
 *
 * 섹션 하나를 다시 만들면 라이브러리의 그 자리만 바꾼다 — 나머지를 다시 굽지 않는다.
 * 새 파일을 먼저 올리고 표를 고친 **뒤에** 옛 파일을 지운다. 순서가 반대면 중간에
 * 실패했을 때 그 자리가 빈다. 표 고치기가 실패하면 새 파일을 지우고 옛 것을 둔다.
 *
 * 자기 작업만 고친다(`user_id` 로 묶는다).
 */
export async function replaceLibraryImageAt(input: {
  userId: string;
  itemId: string;
  position: number;
  origin: LibraryOrigin;
  fileTag: string;
  image: LibraryImageInput;
}): Promise<{ ok: boolean }> {
  const supabase = createSupabaseAdminClient();
  const { data: row, error: readError } = await supabase
    .from("library_images")
    .select("path,thumb_path")
    .eq("item_id", input.itemId)
    .eq("user_id", input.userId)
    .eq("position", input.position)
    .maybeSingle();
  if (readError || !row) return { ok: false };
  const old = row as { path: string; thumb_path: string | null };

  if (!FILE_TAG_RE.test(input.fileTag)) return { ok: false };
  const stem = fileStemTag(input.fileTag);
  const original = Buffer.from(input.image.base64, "base64");
  const marked = input.origin === "ai" ? await markAsAi(original) : original;
  const { bytes, mimeType } = await encodeForStorage(marked, input.image.mimeType);
  const path = `${input.userId}/${input.itemId}/${input.position}-${stem}.${extensionFor(mimeType)}`;
  const uploaded: string[] = [];
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mimeType, upsert: true });
  if (uploadError) return { ok: false };
  uploaded.push(path);

  const candidate = await makeThumbnail(bytes);
  let thumbPath: string | null = null;
  if (candidate && candidate.length < bytes.length) {
    const next = `${input.userId}/${input.itemId}/${input.position}-${stem}.thumb.webp`;
    const { error } = await supabase.storage.from(BUCKET).upload(next, candidate, { contentType: "image/webp", upsert: true });
    if (!error) {
      thumbPath = next;
      uploaded.push(next);
    }
  }

  const { error: updateError } = await supabase
    .from("library_images")
    .update({ path, mime_type: mimeType, thumb_path: thumbPath })
    .eq("item_id", input.itemId)
    .eq("user_id", input.userId)
    .eq("position", input.position);
  if (updateError) {
    await supabase.storage.from(BUCKET).remove(uploaded);
    return { ok: false };
  }
  // 표지는 첫 자리다. 첫 자리를 바꿨으면 표지도 따라간다.
  if (input.position === 0) {
    const { error: coverError } = await supabase
      .from("library_items")
      .update({ cover_path: path, cover_thumb_path: thumbPath })
      .eq("id", input.itemId)
      .eq("user_id", input.userId);
    /*
      **표지를 못 고쳤으면 옛 파일을 지우지 않는다**(독립 리뷰 MEDIUM-1). 지우면 표지가
      없는 파일을 가리켜 목록 카드가 깨진다. 옛 파일은 표지로 남는다.
    */
    if (coverError) {
      console.warn("[library:replace] 표지를 못 고쳐 옛 파일을 둡니다", coverError.message);
      return { ok: true };
    }
  }
  // 새 것이 자리를 잡은 뒤에 옛 파일을 지운다. 같은 이름이면 지우지 않는다(덮어썼다).
  // 내 폴더 밖의 위치는 지우지 않는다 — 남의 그림이 지워진다(2026-10-03).
  const stale = onlyInOwnerFolder([old.path, old.thumb_path], input.userId).filter((value) => !uploaded.includes(value));
  if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
  return { ok: true };
}

/** 자리를 옮기는 동안 잠시 쓰는 번호의 바닥. 자리 번호는 겹칠 수 없다(`unique (item_id, position)`). */
const REORDER_PARKING = 100_000;

/**
 * 작업의 그림 **자리만 옮긴다**(서버가 상세페이지를 맞출 때, 사용자가 섹션 순서를 바꿨다).
 *
 * `order` 는 지금 자리 번호를 새 차례대로 늘어놓은 것이다 — `order[i]` 자리가 `i` 로 간다.
 * **파일은 건드리지 않는다.** 표의 번호만 바꾼다. 번호가 겹칠 수 없어 먼저 멀리 비켜
 * 세웠다가 제자리로 온다. 중간에 멈추면 멀리 선 채로 남지만 차례는 그대로라, 다음
 * 맞추기가 다시 옮긴다. **비켜 세울 번호는 지금 가장 큰 번호 위에서 고른다** — 앞서
 * 멈춰 남은 줄과 겹치면 매번 같은 곳에서 실패했다(3차 리뷰 LOW). 표지는 새 첫 자리를
 * 따라간다.
 *
 * 자기 작업만 고친다(`user_id` 로 묶는다).
 */
export async function reorderLibraryImages(input: {
  userId: string;
  itemId: string;
  order: readonly number[];
}): Promise<{ ok: boolean }> {
  if (new Set(input.order).size !== input.order.length) return { ok: false };
  const supabase = createSupabaseAdminClient();
  const move = async (from: number, to: number) => {
    const { error } = await supabase
      .from("library_images")
      .update({ position: to })
      .eq("item_id", input.itemId)
      .eq("user_id", input.userId)
      .eq("position", from);
    if (error) throw new Error(error.message);
  };
  try {
    const { data: top, error: topError } = await supabase
      .from("library_images")
      .select("position")
      .eq("item_id", input.itemId)
      .eq("user_id", input.userId)
      .order("position", { ascending: false })
      .limit(1);
    if (topError) throw new Error(topError.message);
    const highest = ((top ?? []) as Array<{ position: number }>)[0]?.position ?? 0;
    const parking = Math.max(highest, REORDER_PARKING) + 1;

    for (const [index, position] of input.order.entries()) await move(position, parking + index);
    for (const index of input.order.keys()) await move(parking + index, index);

    const { data: first, error: readError } = await supabase
      .from("library_images")
      .select("path,thumb_path")
      .eq("item_id", input.itemId)
      .eq("user_id", input.userId)
      .eq("position", 0)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (first) {
      const cover = first as { path: string; thumb_path: string | null };
      const { error: coverError } = await supabase
        .from("library_items")
        .update({ cover_path: cover.path, cover_thumb_path: cover.thumb_path })
        .eq("id", input.itemId)
        .eq("user_id", input.userId);
      if (coverError) console.warn("[library:reorder] 표지를 못 고쳤습니다", coverError.message);
    }
    return { ok: true };
  } catch (error) {
    console.error("[library:reorder]", error);
    return { ok: false };
  }
}

/**
 * 같은 작업이면 **이어 붙이고**, 처음이면 새로 만든다.
 *
 * 리디자인은 섹션을 한 장씩 만든다. 그때마다 `saveLibraryItem` 을 부르면
 * 목록에 같은 페이지가 여덟 줄로 흩어진다. 한 줄로 모으려면 「이 장이 어느
 * 작업의 것인가」를 알아야 하는데, 그 열쇠가 `sourceId`(화면의 프로젝트 id)다.
 *
 * **`sourceId` 가 없으면 지금까지처럼 새로 만든다.**
 *
 * 상세페이지도 이제 쓴다. 한 요청이 10MB 를 넘으면 앞단이 잘라, 여러 장을
 * 나눠 보내며 한 작업에 모은다(2026-09-23).
 */
export async function saveOrAppendLibraryItem(
  input: SaveLibraryItemInput & {
    /**
     * 이 묶음이 **몇 번째 장부터**인가. 주면 서버가 이미 있는 장수와 대조해
     * 같은 장을 두 번 붙이지 않는다(`appendDecision`). 상세페이지가 준다.
     * 안 주면 지금까지처럼 뒤에 붙인다 — 리디자인이 그렇게 부른다.
     */
    startPosition?: number;
  },
) {
  if (!input.sourceId) return saveLibraryItem(input);

  const existing = await findLibraryItemBySource(input.userId, input.tool, input.sourceId);
  const decision = appendDecision({
    existingCount: existing ? existing.imageCount : null,
    startPosition: input.startPosition,
    count: input.images.length,
  });

  if (decision.kind === "already") {
    // 다시 보낸 것이다. 성공으로 답해야 화면이 다음 묶음으로 넘어간다.
    return { ok: true as const, id: existing?.id ?? "", imageCount: 0, totalCount: decision.imageCount, alreadySaved: true };
  }
  if (decision.kind === "conflict") {
    return {
      ok: false as const,
      conflict: true,
      totalCount: decision.imageCount,
      message: "라이브러리에 저장된 장수가 달라 이어서 올리지 못했습니다. 다시 눌러 주세요.",
    };
  }
  if (decision.kind === "create" || !existing) return saveLibraryItem(input);
  return saveLibraryItem({
    ...input,
    appendTo: { itemId: existing.id, startPosition: decision.startPosition },
  });
}

/**
 * 같은 작업(`sourceId`)이 이미 있으면 그 id 와 장수. **자기 것만** 찾는다.
 *
 * 화면이 올리기 전에 「몇 장까지 있나」를 묻는 데도 쓴다 — 다시 연 초안이
 * 이미 올린 장을 굽고 보내는 수고를 덜어 준다.
 */
export async function findLibraryItemBySource(
  userId: string,
  tool: SaveLibraryItemInput["tool"],
  sourceId: string,
): Promise<{ id: string; imageCount: number } | null> {
  const supabase = createSupabaseAdminClient();
  /*
    **가장 오래된 한 줄을 고른다.** 표에 `(user_id, tool, source_id)` 고유
    제약이 없어, 첫 저장 둘이 겹치면 줄이 둘 생길 수 있다. 그때 `maybeSingle`
    은 오류와 빈 값을 주고, 빈 값을 「없음」으로 읽으면 저장할 때마다 줄이 하나씩
    더 생긴다(2차 독립 리뷰). **오류는 던진다** — 「없음」과 「모름」은 다르다.
  */
  const { data, error } = await supabase
    .from("library_items")
    .select("id")
    .eq("user_id", userId)
    .eq("tool", tool)
    .eq("source_id", sourceId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { id: string } | undefined;
  if (!row) return null;

  /*
    **장수는 행을 직접 센다.** `image_count` 갱신이 실패하면 낡은 수가 남고,
    그 수를 믿고 이어 붙이면 자리가 겹친다.
  */
  const { count, error: countError } = await supabase
    .from("library_images")
    .select("id", { count: "exact", head: true })
    .eq("item_id", row.id);
  if (countError) throw new Error(countError.message);
  return { id: row.id, imageCount: Math.max(0, count ?? 0) };
}

/**
 * 만든 사람의 이메일을 붙인다. **관리자 목록에서만 부른다.**
 *
 * 조인 대신 두 번 묻는다. PostgREST 임베드는 관계 이름이 바뀌면 조용히
 * 빈 값을 주는데, 여기서 빈 값은 "누가 만들었는지 모르는 목록"이 된다.
 */
async function emailsByUserId(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return new Map();
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("profiles").select("id,email").in("id", unique);
  return new Map(
    ((data ?? []) as Array<{ id: string; email: string | null }>)
      .filter((row) => row.email)
      .map((row) => [row.id, row.email as string]),
  );
}

async function listLegacyLibraryItems(viewer: LibraryViewer): Promise<ServerLibraryItem[]> {
  // 로컬 확인 모드에는 이 보관함이 없다. 500 을 내면 서버가 고장난 것처럼
  // 보이지만 사실은 안 쓰는 저장소다. 비어 있다고 답하는 것이 정직하다.
  if (isLocalStoreEnabled()) return [];
  const supabase = createSupabaseAdminClient();

  let query = scopedRead(
    supabase
      .from("library_items")
      .select("id,user_id,title,tool,aspect_ratio,source_type,source_id,image_count,cover_path,cover_thumb_path,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    readScope(viewer),
  );
  // 목록에만 건다. 한 건을 열 때는 안 건다 — 프로젝트를 고른 채로 다른 갈래의
  // 작업물 주소를 받으면 열리지 않는 편이 더 놀랍다.
  if (viewer.projectId) query = query.eq("project_id", viewer.projectId);

  const { data, error } = await query;
  if (error || !data) return [];

  /**
   * **원본과 사본을 둘 다 서명한다.**
   *
   * 사본으로 갈음하고 싶지만 그럴 수 없다 — `coverUrl` 은 화면에만 쓰이지
   * 않는다. 「저장된 이미지에서 고르기」가 이 주소를 받아 파일로 만들어
   * 상세페이지와 리디자인의 **생성 입력**으로 넘긴다. 거기에 512px 손실
   * 사본을 물리면 크레딧을 쓰는 결과물의 품질이 조용히 깎인다.
   *
   * 그래서 목록 카드가 쓸 `coverThumbUrl` 을 따로 낸다. 두 경로를 한 번의
   * `createSignedUrls` 에 함께 넣으므로 왕복은 늘지 않는다.
   */
  // 그 작업 주인의 폴더 안일 때만 서명한다 — 밖이면 남의 그림이 열린다(2026-10-03).
  const covers = data
    .flatMap((row: { user_id: string; cover_path: string | null; cover_thumb_path: string | null }) =>
      onlyInOwnerFolder([row.cover_path, row.cover_thumb_path], String(row.user_id)));
  const signed = covers.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(covers, SIGNED_URL_TTL_SECONDS)
    : { data: [] };

  const urlByPath = toUrlMap(signed.data);
  /**
   * 누가 만들었는지는 **남의 것이 섞일 때만** 붙인다.
   *
   * 혼자면 목록이 전부 자기 것이라 붙일 이유가 없고, 붙이면 회원끼리 이메일이
   * 보이는 길이 하나 생긴다.
   *
   * 팀에 있으면 붙인다. 팀 목록에는 남의 것이 섞이는데 누가 만든 건지 모르면
   * 「이건 누구 작업이지」를 물으러 나가야 한다. 같은 팀 사람의 메일 주소는
   * 팀 화면이 이미 명단으로 보여준다.
   */
  const scope = readScope(viewer);
  const emails = scope.isAdmin || scope.teamId
    ? await emailsByUserId(data.map((row: { user_id: string }) => row.user_id))
    : new Map<string, string>();

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    tool: row.tool as LibraryTool,
    aspectRatio: (row.aspect_ratio as string | null) ?? null,
    sourceType: (row.source_type as LibrarySourceType | null) ?? "generation",
    sourceId: (row.source_id as string | null) ?? null,
    imageCount: Number(row.image_count ?? 0),
    createdAt: String(row.created_at),
    coverUrl: row.cover_path ? urlByPath.get(row.cover_path as string) ?? null : null,
    coverThumbUrl: row.cover_thumb_path
      ? urlByPath.get(row.cover_thumb_path as string) ?? null
      : null,
    mine: row.user_id === viewer.userId,
    ownerEmail: emails.get(row.user_id as string) ?? null,
  }));
}

/**
 * 계정 보관 작업 **한 건**. 과정과 낱장을 함께 준다.
 *
 * 목록(`listLibraryItems`)에 과정을 싣지 않는 이유는 무게다 — 한 줄마다
 * 기획안이 딸려 오면 라이브러리를 여는 것만으로 수 MB 가 오간다. 열 때만
 * 받는다.
 *
 * **보이는지는 `canSeeItem` 하나가 정한다.** 여기에 소유자 조건을 따로 적으면
 * 그 둘이 언젠가 어긋나고, 어긋나는 쪽이 남의 작업이 새는 쪽이다.
 *
 * 없거나 못 볼 것이면 `null` 이다 — 부르는 쪽이 404 로 답해야 하는데 예외로
 * 던지면 500 이 된다.
 */
export async function getLibraryItem(viewer: LibraryViewer, itemId: string) {
  const adapter=await documentAdapterFor(viewer);
  const document=adapter?await documentSide("작업",()=>adapter.work(itemId)):null;
  if(document)return document;
  if (isLocalStoreEnabled()) return null;
  if (!(await canSeeItem(viewer, itemId))) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("library_items")
    .select("id,user_id,title,tool,aspect_ratio,image_count,created_at,data,source_id")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const ownerId = row.user_id as string;
  const sourceId=row.source_id;
  if(adapter && row.tool==="create" && typeof sourceId==="string"){
    const linked=await documentSide("연결 작업",()=>adapter.work(sourceId));
    if(linked)return linked;
  }
  // 만든 사람은 **남의 것일 때만** 붙인다. 자기 것이면 붙일 이유가 없고,
  // 붙이면 회원끼리 이메일이 보이는 길이 하나 생긴다.
  const mine = ownerId === viewer.userId;
  const emails = mine ? new Map<string, string>() : await emailsByUserId([ownerId]);

  return {
    id: row.id as string,
    title: row.title as string,
    tool: row.tool as LibraryTool,
    aspectRatio: (row.aspect_ratio as string | null) ?? null,
    imageCount: Number(row.image_count ?? 0),
    createdAt: String(row.created_at),
    mine,
    ownerEmail: emails.get(ownerId) ?? null,
    /** 만든 과정. 이 칸이 생기기 전 작업은 `null` 이다 — 소급되지 않는다. */
    process: (row.data as Record<string, unknown> | null) ?? null,
  };
}

/**
 * 이 작업물이 이 사람에게 보이는가.
 *
 * **자식 표는 부모를 통해 판정한다.** `library_images` 에는 `team_id` 가
 * 없다 — 4단계에서 자식에 칸을 안 단 이유가 이것이다. 양쪽에 달면 둘이
 * 어긋나는 날이 오고, 그때 어느 쪽이 맞는지 정할 근거가 없다.
 *
 * 그래서 자식을 읽기 전에 부모를 한 번 확인한다. 질의가 하나 늘지만,
 * 「팀원의 것도 대충 보이게」 하는 어림짐작보다 낫다.
 */
/**
 * **내가 만든 것인가.** 팀도 전체 범위도 안 본다.
 *
 * `canSeeItem` 은 팀 것까지 보여 주는데, 내보내기는 그러면 안 된다 — 같은 팀
 * 사람의 그림이라도 가공해서 파일로 내려받는 것은 다른 일이다.
 */
async function ownsItem(viewer: LibraryViewer, itemId: string): Promise<boolean> {
  const { data } = await createSupabaseAdminClient()
    .from("library_items")
    .select("id")
    .eq("id", itemId)
    .eq("user_id", viewer.userId)
    .maybeSingle();
  return Boolean(data);
}

async function canSeeItem(viewer: LibraryViewer, itemId: string): Promise<boolean> {
  const { data } = await scopedRead(
    createSupabaseAdminClient().from("library_items").select("id").eq("id", itemId),
    readScope(viewer),
  ).maybeSingle();
  return Boolean(data);
}

/** 한 건의 이미지 전체. 서명 URL 이라 수명이 있다. */
export async function getLibraryItemImages(viewer: LibraryViewer, itemId: string) {
  const adapter=await documentAdapterFor(viewer);
  const documentImages=adapter?await documentSide("그림",()=>adapter.images(itemId)):null;
  if(documentImages)return documentImages;
  const supabase = createSupabaseAdminClient();

  if (!(await canSeeItem(viewer, itemId))) return [];

  let { data, error } = await supabase
    .from("library_images")
    .select("position,path,mime_type,user_id")
    .eq("item_id", itemId)
    .order("position", { ascending: true });
  if (error || !data?.length) return [];
  // 목록과 같은 규칙으로 뺀다 — 카드의 장수와 열었을 때의 장수가 같아야 한다(W9).
  if(adapter)data=await withoutDocumentRows(adapter,itemId,data);

  // 그 줄 주인의 폴더 안일 때만 서명한다 — 밖이면 남의 그림이 열린다(2026-10-03).
  const signable = data.flatMap((row: { path: string; user_id: string }) => onlyInOwnerFolder([row.path], String(row.user_id)));
  const signed = signable.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(signable, SIGNED_URL_TTL_SECONDS)
    : { data: [] };

  const urlByPath = toUrlMap(signed.data);

  return data.map((row: Record<string, unknown>) => ({
    position: Number(row.position),
    mimeType: row.mime_type as string,
    url: urlByPath.get(row.path as string) ?? null,
  }));
}

/**
 * 그림 한 장의 실제 바이트.
 *
 * 목록·뷰어는 Storage 서명 URL 을 그대로 쓴다. 이 길은 **내려받기 전용**이다 —
 * 우리 손을 거쳐야 저장된 형식과 무관하게 PNG 로 되돌려 줄 수 있기 때문이다.
 *
 * 서명 URL 이 하던 방어를 여기서는 코드가 대신한다. 지켜야 할 것이 셋이다.
 *
 * 1. **소유자 조건은 `libraryScope` 하나로 정한다.** 관리자용 질의를 따로
 *    두지 않는다 — 질의가 둘로 갈라지면 그 둘이 어긋나는 날이 사고 나는 날이다.
 * 2. **경로는 표에 적힌 것을 쓴다.** 주소로 받은 값을 이어 붙이면 그 값이
 *    그대로 저장소 경로가 된다.
 * 3. **형식은 실제 바이트로 정한다.** `mime_type` 칸에는 화면이 보낸 문자열이
 *    그대로 들어올 수 있어서, 그 값을 헤더로 흘리면 같은 출처에서 임의 문서가
 *    열린다. 못 알아보는 바이트는 그림이라고 말하지 않는다.
 */
export async function getLibraryImageFile(
  viewer: LibraryViewer,
  itemId: string,
  position: number,
  /**
   * 무엇을 하려고 읽는가.
   *
   * **기본은 `read` 라 기존 호출부가 안 바뀐다.** 광고 규격 내보내기만
   * `export` 를 넘겨 관리자에게도 소유자 조건을 건다 — 보고 지우는 것과
   * 가공해 내려받는 것은 무게가 다르다(`libraryScope` 머리말).
   */
  action: "read" | "export" = "read",
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const adapter=await documentAdapterFor(viewer);
  const documentFile=adapter?await documentSide("파일",()=>adapter.file(itemId,position,action)):null;
  if(documentFile)return documentFile;
  const supabase = createSupabaseAdminClient();

  /**
   * **내보내기는 자기 것만 본다.** 「보기」와 「가공해 내려받기」는 무게가
   * 다르다 — ZIP 이 만들어지는 순간 서비스 밖으로 나가고 그 안에는 누구
   * 것인지 안 적힌다. 게다가 `/ad` 목록은 전체가 열린 사람에게 남의 것도
   * 싣는데 화면이 소유자를 안 보여 준다 — **본인도 남의 것인 줄 모른 채 뽑는다.**
   */
  const visible = action === "export"
    ? await ownsItem(viewer, itemId)
    : await canSeeItem(viewer, itemId);
  if (!visible) return null;

  const { data, error } = await supabase
    .from("library_images")
    .select("path,user_id")
    .eq("item_id", itemId)
    .eq("position", position);
  const row = (data as Array<{ path?: string; user_id?: string }> | null)?.[0];
  const path = row?.path;
  if (error || !path) return null;
  // 주인 폴더 밖이면 남의 그림을 내려 준다(광고 규격 생성 재료로도) — 2026-10-03.
  if (!inOwnerFolder(path, String(row?.user_id ?? ""))) return null;

  const file = await supabase.storage.from(BUCKET).download(path);
  if (file.error || !file.data) return null;

  const bytes = Buffer.from(await file.data.arrayBuffer());
  return { bytes, mimeType: sniffImageMime(bytes, "application/octet-stream") };
}

/**
 * 삭제. 파일을 먼저 지운다.
 *
 * on delete cascade 는 행만 지우고 Storage 파일은 남긴다. 지웠다고 생각한
 * 이미지가 서버에 남아 있는 것이 가장 나쁘다.
 *
 * **관리자는 남의 것도 지운다.** 잘못 올라온 것을 내릴 사람이 아무도 없으면
 * 그대로 남는다 — 2026-09-04 운영자 판단.
 */
export async function deleteLibraryItem(viewer: LibraryViewer, itemId: string) {
  // 문서 전체 삭제는 확인을 받는 전용 문서 API에서만 처리한다.
  const supabase = createSupabaseAdminClient();
  const owner = libraryScope(viewer, "delete");

  /**
   * 조건이 없으면 **아예 걸지 않는다.**
   *
   * `null` 을 그대로 `eq` 에 넘기면 「소유자가 비어 있는 줄」을 찾는 질의가
   * 된다. 한 줄도 안 지우면서 오류도 안 나므로, 화면에는 「지웠다」가 뜨고
   * 실제로는 그대로 남는다. 관리자에게 조건이 사라진 지금 이 함정이 열렸다.
   */
  const imageQuery = supabase.from("library_images").select("path,thumb_path,user_id").eq("item_id", itemId);
  const { data: images, error: imagesError } = await (owner ? imageQuery.eq("user_id", owner) : imageQuery);

  /**
   * **못 읽으면 아무것도 지우지 않는다.**
   *
   * 여기서 조용히 넘어가면 지울 경로를 하나도 못 구한 채 아래 행 삭제가
   * 성공한다 — 행은 사라지고 파일은 전부 남는데 화면에는 「지웠다」가 뜬다.
   * 파일을 못 지울 것이면 행도 지우면 안 된다.
   */
  if (imagesError) {
    return { ok: false as const, message: `그림 목록을 읽지 못해 지우지 않았습니다: ${imagesError.message}` };
  }

  // **작은 사본도 함께 지운다.** 표를 지우면 사본의 자리를 아는 곳이 사라지므로,
  // 여기서 빠뜨리면 아무도 못 찾는 파일이 용량만 차지한 채 영영 남는다.
  // 그 줄 주인의 폴더 밖은 지우지 않는다(관리자가 지울 때도) — 남의 그림이 지워진다(2026-10-03).
  const paths = (images ?? [])
    .flatMap((row: { path: string; thumb_path: string | null; user_id: string }) =>
      onlyInOwnerFolder([row.path, row.thumb_path], String(row.user_id)));

  /**
   * **행을 먼저 지우고, 지운 줄을 세어 본다.**
   *
   * 목록은 팀원의 작업물까지 보여 주는데(`listLibraryItems` 의 `scopedRead`)
   * 삭제는 소유자 조건이 걸린다. 조건에 안 걸리면 supabase-js 는 오류 대신
   * 빈 결과를 주므로, 세지 않으면 `ok: true` 가 나가고 화면에서는 사라졌다가
   * 새로고침하면 되살아난다.
   *
   * 파일 삭제를 뒤로 옮긴 것도 같은 이유다. 앞에 두면 지울 권한이 없는 항목의
   * 그림만 지우고 행은 남기는 순간이 생긴다.
   */
  const deleteQuery = supabase.from("library_items").delete().eq("id", itemId).select("id");
  const { data: deleted, error } = await (owner ? deleteQuery.eq("user_id", owner) : deleteQuery);
  if (error) return { ok: false as const, message: error.message };
  if (!(deleted ?? []).length) {
    return { ok: false as const, denied: true as const, message: "내가 만든 작업물만 지울 수 있습니다." };
  }

  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  return { ok: true as const };
}

export async function listLibraryItems(viewer: LibraryViewer): Promise<ServerLibraryItem[]> {
  const adapter = await documentAdapterFor(viewer);
  const [legacyResult, documentResult] = await Promise.allSettled([listLegacyLibraryItems(viewer), adapter ? adapter.list() : null]);
  const legacy = legacyResult.status === "fulfilled" ? legacyResult.value : [];
  const documents = documentResult.status === "fulfilled" ? documentResult.value : null;
  if (documentResult.status === "rejected") console.warn("[library] 상세페이지 목록을 불러오지 못했습니다.");
  if (!adapter || !documents) return legacy;
  // 지운 문서 목록만 못 읽어도 목록은 연다 — 정리를 기다리는 옛 작업이 잠시 보일 뿐이다(3차 리뷰 W20).
  const excluded = new Set((await documentSide("삭제 목록", () => adapter.excluded())) ?? []);
  const kept = legacy.filter((item) => !(item.tool === "create" && excluded.has(item.sourceId ?? "")));
  const trimmed = await trimLinkedLegacy(kept, documents);
  // 가졌던 지문은 옛 그림을 가르는 데만 쓴다 — 화면에 보낼 까닭이 없고 문서마다 수백 개일 수 있다.
  return [...documents.map(({ heldImageTags: _held, ...document }) => document), ...trimmed];
}

type DocumentAdapter = ReturnType<typeof import("./pdp/documents/library-adapter")["documentLibraryAdapter"]>;
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** 서버 문서 기능이 켜져 있을 때만 문서 쪽 길을 연다. 꺼져 있으면 문서 표를 건드리지 않는다. */
async function documentAdapterFor(viewer: LibraryViewer): Promise<DocumentAdapter | null> {
  if (!serverDocumentsEnabled()) return null;
  return (await import("./pdp/documents/library-adapter")).documentLibraryAdapter(viewer);
}

/**
 * **문서 쪽 조회가 실패해도 옛 라이브러리 길은 연다**(3차 리뷰 W20). 문서 없이 계속하고 로그만
 * 남긴다 — 문서 표 하나가 앓는다고 옛 작업 열기·그림·파일 받기까지 500 이 되면 안 된다.
 */
async function documentSide<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.warn(`[library] 상세페이지 ${what} 조회 실패. 문서 없이 옛 경로로 계속합니다`, error instanceof Error ? error.message : error);
    return null;
  }
}

type RowFacts = { path: string };
const artifactOf = (row: RowFacts) => parseLibraryFileKey(row.path)?.artifact ?? null;

/** 한 작업을 열 때: 연결된 문서가 보여 주거나 일부러 뺀 그림을 뺀다(W9). 문서를 못 읽으면 그대로 둔다. */
async function withoutDocumentRows<T extends RowFacts>(adapter: DocumentAdapter, itemId: string, rows: T[]): Promise<T[]> {
  const parent = await createSupabaseAdminClient().from("library_items").select("source_id,tool").eq("id", itemId).maybeSingle();
  const sourceId = parent.data?.tool === "create" ? (parent.data.source_id as string | null) : null;
  if (!sourceId) return rows;
  const linked = await documentSide("연결 문서", () => adapter.linkedDocument(sourceId));
  return linked ? rows.filter((row) => !legacyRowHidden(artifactOf(row), linked)) : rows;
}

type LinkedRow = RowFacts & { item_id: string; position: number; thumb_path: string | null; user_id: string };
/** 한 번에 읽는 줄 수(프로젝트 최대 행 수 기본 1000)와 `in` 한 번에 넣는 작업 수(uuid 하나가 주소에서 약 39바이트). */
const LINKED_ROW_PAGE = 1000;
const LINKED_ITEM_CHUNK = 100;

/** 연결된 옛 작업들의 그림 줄을 **한 번에** 읽는다(W11). 못 읽으면 `null` — 부르는 쪽이 줄이지 않는다. */
async function readLinkedRows(supabase: AdminClient, itemIds: string[]): Promise<LinkedRow[] | null> {
  let rows: LinkedRow[] = [];
  for (let start = 0; start < itemIds.length; start += LINKED_ITEM_CHUNK) {
    const ids = itemIds.slice(start, start + LINKED_ITEM_CHUNK);
    for (let offset = 0; ; offset += LINKED_ROW_PAGE) {
      const { data, error } = await supabase.from("library_images").select("item_id,position,path,thumb_path,user_id")
        .in("item_id", ids).order("item_id").order("position").range(offset, offset + LINKED_ROW_PAGE - 1);
      if (error || !data) return null;
      rows = [...rows, ...(data as LinkedRow[])];
      if (data.length < LINKED_ROW_PAGE) break;
    }
  }
  return rows;
}

/**
 * 문서와 연결된 옛 작업에서 **문서가 보여 주거나 일부러 뺀 그림**을 뺀다(W9, 규칙은 `legacyRowHidden`).
 * 그림 줄은 한 번에 읽고, 표지가 바뀐 작업만 한 번에 서명한다(W11). 줄을 못 읽으면 그대로 보인다
 * — 사라지는 그림이 없어야 한다(F10).
 */
async function trimLinkedLegacy(items: ServerLibraryItem[], documents: ServerLibraryItem[]): Promise<ServerLibraryItem[]> {
  const linkedOf = (item: ServerLibraryItem) => (item.tool === "create"
    ? documents.find((doc) => doc.id === item.sourceId || doc.sourceId === item.sourceId) : undefined);
  const linked = items.filter((item) => linkedOf(item));
  if (!linked.length || isLocalStoreEnabled()) return items;
  const supabase = createSupabaseAdminClient();
  const rows = await readLinkedRows(supabase, linked.map((item) => item.id));
  if (!rows) return items;
  const split = new Map(linked.map((item) => {
    const doc = linkedOf(item)!;
    const own = rows.filter((row) => row.item_id === item.id);
    return [item.id, { own, visible: own.filter((row) => !legacyRowHidden(artifactOf(row), doc)) }] as const;
  }));
  const changed = [...split.values()].filter(({ own, visible }) => visible.length && visible.length < own.length);
  // 그 줄 주인의 폴더 안일 때만 서명한다 — 밖이면 남의 그림이 열린다(2026-10-03).
  const covers = changed.flatMap(({ visible: [cover] }) => onlyInOwnerFolder([cover!.path, cover!.thumb_path], String(cover!.user_id)));
  const signed = covers.length ? await supabase.storage.from(BUCKET).createSignedUrls(covers, SIGNED_URL_TTL_SECONDS) : { data: [] };
  const urls = toUrlMap(signed.data);
  return items.flatMap((item) => {
    const entry = split.get(item.id);
    if (!entry || entry.visible.length === entry.own.length) return [item];
    const cover = entry.visible[0];
    if (!cover) return [];
    return [{ ...item, imageCount: entry.visible.length, coverUrl: urls.get(cover.path) ?? null,
      coverThumbUrl: cover.thumb_path ? urls.get(cover.thumb_path) ?? null : null }];
  });
}
