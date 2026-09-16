import "server-only";

import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import {
  copiedCharacterAssetPath, copiedLibraryAssetPath,
  posterCopyPlan, snsCopyPlan, type AssetMove,
} from "./copy-paths";
import { isLocalStoreEnabled } from "../../../../lib/local-store";
import {
  createSupabaseSnsProjectRepository, record as toSnsRecord,
  type ProjectRow as SnsProjectRow,
} from "../../sns/projects/project-store";
import { collectCardPaths, withCardUrls } from "../../../../lib/sns/list-urls";
import {
  posterAssetPathsToRemove,
  projectInsertRow,
  toImageRecord,
  toProjectRecord as toPosterRecord,
  type PosterImageRow,
  type PosterProjectRow,
} from "../../../../lib/poster/supabase-store-core";
import type { PosterProjectRecord } from "@fixup/poster-core";
import type { SnsProjectCreateRecord, SnsProjectRecord } from "../../sns/projects/project-service";
import { listCharacters } from "../../../../lib/characters";
import { ownerIdsOf, withOwner } from "./core";
import { snsCardPathsToRemove } from "../../../../lib/sns/thumbnail";

/**
 * 관리자가 보는 **모든 회원의 작업물** — 저장소를 만지는 쪽.
 *
 * 회원용 목록(`/api/sns/projects`, `/api/poster/projects`)을 넓히지 않고 길을
 * 따로 냈다. 한 주소에서 물음표 하나로 「전부」와 「내 것」이 갈리면, 언젠가 그
 * 조건이 어긋나 남의 작업이 회원에게 새 나간다. 회원이 쓰는 길은 손대지
 * 않는 편이 안전하다.
 *
 * **전부 admin 클라이언트로 읽는다.** 회원 클라이언트는 RLS 와 Storage 정책이
 * 소유자로 막으므로, 남의 작업은 행도 안 나오고 그림 주소도 못 만든다.
 *
 * 넓히는 것은 **읽기뿐이다.** 지우기·고치기는 회원용 길 그대로라 관리자라도
 * 자기 것만 한다. 남이 크레딧을 써서 만든 결과를 되돌릴 수 없게 없애는 일은,
 * 무엇을 첫 화면에 걸까 보려고 목록을 여는 일과 무게가 다르다.
 */

const IMAGE_COLUMNS_FOR_ADMIN =
  "id,project_id,generation_request_id,variant_index,selected,asset_path,thumb_path,width,height,review,created_at";

const BUCKET = "library";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const POSTER_PROJECT_COLUMNS =
  "id,user_id,title,status,ratio,model_id,data,created_at,updated_at";
const POSTER_IMAGE_COLUMNS =
  "id,user_id,project_id,generation_request_id,variant_index,selected,asset_path,width,height,review,created_at";

/** 만든 사람의 이메일. 관리자 화면에서만 부른다. */
async function emailsByUserId(userIds: readonly string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const { data } = await createSupabaseAdminClient()
    .from("profiles")
    .select("id,email")
    .in("id", userIds);
  return new Map(((data ?? []) as Array<{ id: string; email: string }>).map((row) => [row.id, row.email]));
}

/**
 * 카드뉴스 전부.
 *
 * 카드 그림은 서명 주소로 나간다. **서명도 admin 클라이언트로 한다** — 회원
 * 클라이언트로 남의 경로에 서명하려 하면 Storage 정책이 막아, 목록은 나오는데
 * 그림만 전부 비는 상태가 된다. 그러면 「무엇을 만들었나」를 볼 수 없어 이
 * 화면의 목적 자체가 사라진다.
 */
async function listAllSnsProjects() {
  const admin = createSupabaseAdminClient();
  const projects = await createSupabaseSnsProjectRepository(admin).list();
  const paths = collectCardPaths(projects);
  if (!paths.length) return projects;

  const signed = await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  // 서명에 실패해도 목록은 준다. 그림이 빈 것과 목록이 통째로 없는 것은 다르다.
  if (signed.error) return projects;
  return withCardUrls(projects, new Map(
    (signed.data ?? []).flatMap((entry) => (
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : []
    )),
  ));
}

/** 포스터 전부. 변형 그림은 우리 라우트가 흘려 주므로 서명할 것이 없다. */
async function listAllPosterProjects() {
  const admin = createSupabaseAdminClient();
  const { data: projectRows, error } = await admin
    .from("poster_projects")
    .select(POSTER_PROJECT_COLUMNS)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  // 회원용 변환은 `user_id` 를 떨어뜨린다 — 자기 것만 보던 화면에는 필요가
  // 없었다. 여기서는 누구 것인지가 요점이라 줄에서 직접 가져와 되붙인다.
  const projects = ((projectRows ?? []) as PosterProjectRow[]).map((row) => ({
    ...toPosterRecord(row),
    userId: row.user_id,
  }));
  if (!projects.length) return [];

  const { data: imageRows } = await admin
    .from("poster_images")
    .select(POSTER_IMAGE_COLUMNS)
    .in("project_id", projects.map((project) => project.id))
    .order("project_id", { ascending: true })
    .order("variant_index", { ascending: true });

  const images = ((imageRows ?? []) as PosterImageRow[]).map(toImageRecord);
  return projects.map((project) => ({
    ...project,
    images: images.filter((image) => image.projectId === project.id),
  }));
}

/**
 * 모든 회원의 작업물.
 *
 * 로컬 모드에서는 빈 목록을 준다. 로컬 저장소는 사람마다 폴더가 갈려 있어
 * 「전체」라는 것이 없고, 있는 척하면 로컬에서 확인한 것이 운영에서 확인한
 * 것이 아니게 된다.
 */
export async function listAllWorks(viewerId: string) {
  if (isLocalStoreEnabled()) return { sns: [], poster: [] };

  const [sns, poster] = await Promise.all([listAllSnsProjects(), listAllPosterProjects()]);
  const emails = await emailsByUserId(ownerIdsOf([...sns, ...poster]));

  return {
    sns: withOwner(sns, viewerId, emails),
    poster: withOwner(poster, viewerId, emails),
  };
}

/**
 * 어떤 회원의 작업이든 지운다. **관리자만.**
 *
 * 회원용 삭제 길을 넓히지 않고 여기에 따로 둔다. 같은 함수에 「관리자면
 * 조건을 뺀다」를 심으면, 언젠가 그 조건이 어긋나 회원이 남의 작업을 지운다.
 * 되돌릴 수 없는 일이라 실수의 값이 너무 크다.
 *
 * **비용 기록은 남긴다.** 작업을 지웠다고 돈이 안 나간 것이 되지 않는다.
 * 그걸 지울 수 있으면 장부를 믿을 수 없다.
 *
 * 행을 먼저 지우고 파일을 나중에 지운다. 파일이 먼저 사라지면 목록에는
 * 남아 있는데 미리보기만 깨진 상태가 된다.
 *
 * 없는 것을 지우라고 하면 `false` 를 준다 — 두 번 눌러도 오류가 아니다.
 */
/**
 * 작업 한 건을 **소유자와 무관하게** 읽는다.
 *
 * 목록(`listAllWorks`)과 같은 방식이다 — 서비스 키라 RLS 를 지나지 않는다.
 * 회원용 길(`snsFlowStoreForUser`·`posterStoresForUser`)에 관리자 조건을
 * 심지 않는 이유는 `deleteAnyWork` 와 같다.
 *
 * **없으면 `null` 이다. 던지지 않는다** — 부르는 쪽이 404 로 답해야 하는데
 * 예외로 던지면 500 이 된다.
 *
 * **부르는 쪽이 관리자인지 먼저 확인해야 한다.** 이 함수는 묻지 않는다.
 */
export async function readAnyWork(
  kind: "sns" | "poster",
  id: string,
): Promise<Record<string, unknown> | null> {
  const table = kind === "sns" ? "sns_projects" : "poster_projects";
  const { data, error } = await createSupabaseAdminClient()
    .from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  /*
    **화면이 쓰는 모양으로 바꿔서 준다.** 행을 그대로 주면 `userId`·`modelId`
    가 `undefined` 라 화면이 빈다.

    바꾸는 규칙을 여기서 새로 적지 않는다 — 회원용 경로가 쓰는 그 함수를
    그대로 부른다. 따로 적으면 칸 하나가 갈리는 날이 오고, 그때 조용히
    사라지는 것이 `record()` 주석이 말하는 그 일이다.
  */
  if (kind !== "sns") {
    return toPosterRecord(data as PosterProjectRow) as unknown as Record<string, unknown>;
  }

  /*
    **카드 주소까지 채워서 준다.**

    회원용 경로는 `refreshProjectAssetUrls` 를 지나 주소를 채우는데 관리자
    통로는 안 지난다 — 그대로 주면 카드 자리가 빈다. 포스터에서 같은 것을
    겪었고 「그림이 다 삭제됐다」로 읽혔다(2026-09-16 신고).

    주소를 만드는 규칙은 새로 적지 않는다. 목록(`listAllSnsProjects`)이 쓰는
    함수를 그대로 부른다 — 따로 적으면 한쪽만 고쳐지는 날이 온다.
  */
  const record = toSnsRecord(data as SnsProjectRow);
  const paths = collectCardPaths([record]);
  if (!paths.length) return record as unknown as Record<string, unknown>;

  const signed = await createSupabaseAdminClient().storage
    .from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  // 서명에 실패해도 작업은 준다. 그림이 빈 것과 화면이 통째로 안 뜨는 것은 다르다.
  const [withUrls] = withCardUrls([record], new Map(
    (signed.data ?? []).flatMap((entry) => (
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : []
    )),
  ));
  return (withUrls ?? record) as unknown as Record<string, unknown>;
}

/** 확장자에서 형식을 읽는다. 복사에 나오는 것은 png·webp·jpg 셋뿐이다. */
function contentTypeOf(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

/**
 * 파일들을 새 자리로 옮긴다. **원본은 읽기만 한다.**
 *
 * 한 장이 실패해도 나머지는 옮긴다 — 한 장 때문에 복사 전체를 무르면 이미
 * 만든 행과 올린 파일을 되감아야 하고, 그 되감기가 또 실패할 수 있다.
 *
 * **무엇을 옮겼는지 돌려준다.** 전에는 실패를 로그에만 남기고 조용히
 * 넘어갔는데, 부르는 쪽이 그것을 모른 채 행을 전부 적었다. 그러면 행 다섯에
 * 파일 넷이 되어 카드에는 「5장 묶음」인데 열면 넷이다 — 「그림 없는 내
 * 작업」보다 한 단계 나쁜 **거짓말하는 작업**이다(2026-09-16 독립 리뷰).
 */
async function moveAssets(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  moves: AssetMove[],
  bucket: string = BUCKET,
): Promise<Set<string>> {
  const moved = new Set<string>();
  for (const move of moves) {
    const file = await admin.storage.from(bucket).download(move.from);
    if (file.error || !file.data) {
      // 한 줄 남긴다. 조용히 걸러지면 그림이 왜 비었는지 알 길이 없다.
      console.error(`[admin-copy] 원본을 못 읽었습니다(${move.from}): ${file.error?.message ?? "알 수 없음"}`);
      continue;
    }
    const bytes = Buffer.from(await file.data.arrayBuffer());
    /*
      **`contentType` 을 반드시 준다.** 안 주면 supabase-js 가 Buffer 본문에
      `text/plain` 을 붙인다 — 저장된 형식이 틀리면 내려받기·CDN·`nosniff`
      에서 갈린다. 이 저장소의 다른 업로드 자리는 전부 준다.
    */
    const uploaded = await admin.storage.from(bucket)
      .upload(move.to, bytes, { contentType: contentTypeOf(move.to), upsert: true });
    if (uploaded.error) {
      console.error(`[admin-copy] 새 자리에 못 올렸습니다(${move.to}): ${uploaded.error.message}`);
      continue;
    }
    moved.add(move.to);
  }
  return moved;
}

/**
 * 남의 작업을 **내 것으로 복사한다.**
 *
 * 고치는 대신 복사하는 이유 — 쓰기 경로를 안 넓혀도 되기 때문이다. 그 방어선은
 * 「팀원의 카드뉴스에서 생성을 돌리면 크레딧이 예약·차감되고 fal 에 실제 요청이
 * 나간 뒤 결과만 어디에도 안 남았다」는 사고를 겪고 세운 것이다
 * (`lib/sns-flow-store.ts` 머리말).
 *
 * **소유자는 부르는 쪽이 준 값만 쓴다.** 원본 행의 `user_id` 는 버린다.
 *
 * 순서가 중요하다 — **행을 먼저** 만들어야 새 작업 id 가 나오고, 그래야 그림을
 * 어디에 둘지 정할 수 있다.
 *
 * **부르는 쪽이 관리자인지 먼저 확인해야 한다.** 이 함수는 묻지 않는다.
 */
/**
 * 남의 포스터 작업의 **그림까지** 준다.
 *
 * 회원용 기록의 `url` 은 우리 라우트(`/api/poster/projects/...`)를 가리키는데
 * 그 길은 소유자만 지난다 — 관리자가 열면 그림 자리가 빈다. 처음엔 「안
 * 보인다」고 띠에 적고 넘어갔는데, 「과정을 본다」면서 결과를 못 보면 보는
 * 뜻이 없다(2026-09-16 신고: 「그림이 다 삭제됐다」로 읽혔다).
 *
 * 그래서 목록이 쓰는 방법을 그대로 쓴다 — 서비스 키로 **서명 주소**를 만든다.
 */
export async function readAnyWorkImages(
  id: string,
): Promise<Array<Record<string, unknown>>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("poster_images")
    .select(IMAGE_COLUMNS_FOR_ADMIN).eq("project_id", id)
    .order("variant_index", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as PosterImageRow[];
  const paths = rows
    .flatMap((row) => [row.asset_path, row.thumb_path])
    .filter(Boolean) as string[];
  if (!paths.length) return rows.map((row) => ({ ...toImageRecord(row) }));

  const signed = await admin.storage.from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  // 서명에 실패해도 목록은 준다. 그림이 빈 것과 목록이 통째로 없는 것은 다르다.
  const byPath = new Map(
    (signed.data ?? []).flatMap((entry) => (
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : []
    )),
  );

  return rows.map((row) => ({
    ...toImageRecord(row),
    url: byPath.get(row.asset_path) ?? null,
    thumbUrl: row.thumb_path ? byPath.get(row.thumb_path) ?? null : null,
  }));
}

/**
 * 남의 캐릭터 한 장.
 *
 * 회원용 경로(`api/characters/[id]`)는 팀 범위로 걸러져 남의 것은 404 다.
 * 여기서는 **목록과 같은 함수**에 「전체」 범위를 주어 읽는다 — 각도 짝짓기와
 * 서명 규칙을 다시 적지 않으려는 것이다.
 *
 * **부르는 쪽이 관리자인지 먼저 확인해야 한다.** 이 함수는 묻지 않는다.
 */
export async function readAnyCharacter(
  id: string,
): Promise<Record<string, unknown> | null> {
  // 범위가 「전체」라 `userId`·`teamId` 는 쓰이지 않는다. 빈 값을 넘긴다.
  const characters = await listCharacters("", null, { allMembers: true });
  return (characters.find((character) => character.id === id) ?? null) as
    unknown as Record<string, unknown> | null;
}

/** 캐릭터 그림이 사는 버킷. 작업물(`library`)과 다르다. */
const CHARACTER_BUCKET = "characters";

/**
 * 남의 캐릭터를 **내 것으로 복사한다.**
 *
 * 생성을 다시 부르지 않는다 — `createCharacter` 는 고른 그림에서 각도를
 * **새로 만드는** 흐름이라 돈이 나가고 결과도 달라진다. 복사는 있는 것을
 * 그대로 옮기는 일이다.
 *
 * 포스터와 같은 순서다. 행을 먼저 만들어 새 id 를 받고, 그림을 옮기고,
 * 바뀐 경로를 적는다. **경로 첫 칸은 복사한 사람**이어야 버킷 정책이 소유를
 * 맞게 판정한다.
 *
 * **부르는 쪽이 관리자인지 먼저 확인해야 한다.** 이 함수는 묻지 않는다.
 */
/**
 * 복사본을 **팀에서 떼어 낸다.**
 *
 * 이 표들에는 `stamp_team` 트리거가 걸려 있어(`202609070004_team_stamp.sql`),
 * 넣을 때 팀을 안 적으면 **행 주인의 팀**을 찾아 찍는다. 그러면 관리자가
 * 회원 A 의 작업을 복사하는 순간 관리자가 속한 팀 전원이 A 의 기획안 전문과
 * 결과 그림을 자기 팀 작업물로 보게 된다 — A 는 그런 일이 있었는지도 모른다.
 * 출시 전 상업용 기획물이라 무게가 다르다.
 *
 * **넣을 때 `team_id: null` 을 적는 것으로는 안 된다.** 트리거의 관문이
 * `if new.team_id is not null then return new` 라서, 명시한 `null` 은
 * 「안 정했다」와 구분되지 않는다. 그래서 **넣은 직후에 지운다.**
 *
 * 그림을 다 옮긴 뒤로 미루지 않는다. 한 작업에 스무 장이면 몇 초인데, 그
 * 동안 내내 팀에 열려 있다 — 짧다고 없는 것이 아니다.
 *
 * 못 지우면 **던진다.** 조용히 넘어가면 팀에 열린 채로 남는데, 그 사실은
 * 아무 화면에도 안 나타난다.
 */
async function keepCopyPrivate(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  table: "library_items" | "characters" | "sns_projects" | "poster_projects",
  id: string,
): Promise<void> {
  const { error } = await admin.from(table).update({ team_id: null }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * 계정 보관 작업(상세페이지·리디자인) 한 건을 **소유자와 무관하게** 읽는다.
 *
 * 회원용 길(`lib/server-library.ts` 의 `getLibraryItem`)은 `canSeeItem` 을
 * 지나므로 남의 것은 404 다. 거기에 「관리자면 조건을 뺀다」를 심지 않는다 —
 * 그 조건이 언젠가 어긋나면 회원에게 남의 작업이 샌다. `readAnyWork` 와 같은
 * 판단이다.
 *
 * **그림 주소도 채워서 준다.** 서명 주소는 수명이 있어 그때그때 발급한다.
 *
 * **부르는 쪽이 관리자인지 먼저 확인해야 한다.** 이 함수는 묻지 않는다.
 */
export async function readAnyLibraryWork(id: string) {
  if (isLocalStoreEnabled()) return null;
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("library_items")
    .select("id,user_id,title,tool,aspect_ratio,image_count,created_at,data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const ownerId = row.user_id as string;
  const emails = await emailsByUserId([ownerId]);

  const { data: imageRows } = await admin
    .from("library_images")
    .select("position,path")
    .eq("item_id", id)
    .order("position", { ascending: true });

  const paths = ((imageRows ?? []) as Array<{ path: string }>).map((image) => image.path);
  const signed = paths.length
    ? await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    : { data: [] };
  const urlByPath = new Map(
    ((signed.data ?? []) as Array<{ path: string | null; signedUrl: string | null }>)
      .filter((entry) => entry.path && entry.signedUrl)
      .map((entry) => [entry.path as string, entry.signedUrl as string]),
  );

  return {
    work: {
      id: row.id as string,
      title: row.title as string,
      tool: row.tool as "create" | "redesign",
      aspectRatio: (row.aspect_ratio as string | null) ?? null,
      imageCount: Number(row.image_count ?? 0),
      createdAt: String(row.created_at),
      // 관리자가 남의 것을 보는 길이라 **늘 남의 것이다.** 자기 것이면 회원용
      // 길로 이미 열렸다.
      mine: false,
      ownerEmail: emails.get(ownerId) ?? null,
      process: (row.data as Record<string, unknown> | null) ?? null,
    },
    images: ((imageRows ?? []) as Array<{ position: number; path: string }>)
      .map((image) => ({
        position: Number(image.position),
        url: urlByPath.get(image.path) ?? null,
      }))
      .filter((image) => image.url),
  };
}

/**
 * 계정 보관 작업을 **내 것으로 복사한다.**
 *
 * 남의 작업을 고치는 대신 복사한다 — 회원의 자료를 관리자가 바꾸는 일이
 * 없어야 한다(설계 3단계).
 *
 * **낱장 행은 파일을 다 옮긴 뒤에 적는다.** 먼저 적으면 그 사이에 실패했을 때
 * **남의 파일을 가리키는 내 작업**이 남는다 — 원래 회원이 자기 작업을 지우면
 * 내 복사본의 그림이 같이 사라진다. 이 순서면 최악이 「그림 없는 내 작업」이다.
 */
export async function copyLibraryWorkToSelf(
  id: string,
  ownerUserId: string,
): Promise<{ id: string }> {
  const admin = createSupabaseAdminClient();

  const { data: source, error: readError } = await admin
    .from("library_items")
    .select("title,tool,aspect_ratio,data")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!source) throw new Error("원본을 찾을 수 없습니다.");

  const from = source as Record<string, unknown>;

  // 1) 행을 먼저. 그림 자리는 새 작업 id 가 있어야 정해진다.
  const { data: created, error: createError } = await admin
    .from("library_items")
    .insert({
      user_id: ownerUserId,
      title: from.title,
      tool: from.tool,
      aspect_ratio: from.aspect_ratio,
      source_type: "generation",
      // 과정은 그대로 가져온다. 참고용으로 쓰라고 여는 화면이다.
      data: from.data ?? null,
      image_count: 0,
    })
    .select("id")
    .single();
  if (createError || !created) throw new Error(createError?.message ?? "복사하지 못했습니다.");

  const newId = created.id as string;

  /*
    여기서부터는 **깨지면 되돌린다.**

    되돌리지 않으면 `image_count: 0` 에 표지도 없는 행이 남는데, 목록이 그런
    행을 걸러 내므로(`app/library/library-works.ts`) **아무 화면에도 안 보인다.**
    지울 손잡이가 없어 복사해 둔 파일까지 영영 남는다. 같은 표를 쓰는
    `saveLibraryItem` 은 이미 되돌린다 — 한 표에 규칙이 둘이면 안 된다
    (2026-09-16 독립 리뷰).
  */
  const uploaded: string[] = [];
  try {
    await keepCopyPrivate(admin, "library_items", newId);

    // 2) 그림을 새 자리로 옮긴다. 원본은 읽기만 한다.
    const { data: imageRows, error: imagesError } = await admin
      .from("library_images")
      .select("position,path,mime_type,thumb_path")
      .eq("item_id", id)
      .order("position", { ascending: true });
    /*
      **못 읽으면 성공이라고 하지 않는다.** 오류를 안 받으면 빈 배열로 읽혀
      아무것도 안 적은 채 새 id 를 돌려주게 된다 — 화면은 새 작업으로 옮겨
      가서 「볼 수 있는 그림이 없습니다」를 보여 주는데 원본에는 그림이
      멀쩡히 있다. `deleteLibraryItem` 이 같은 함정을 이미 막아 두었다.
    */
    if (imagesError) throw new Error(imagesError.message);

    const source = (imageRows ?? []) as Array<{
      position: number; path: string; mime_type: string | null; thumb_path: string | null;
    }>;

    const moves: AssetMove[] = [];
    const planned: Array<{ position: number; path: string; mime: string; thumb: string | null }> = [];

    for (const image of source) {
      const path = copiedLibraryAssetPath(image.path, ownerUserId, newId);
      // 규약을 벗어난 경로는 옮기지 않고 그 장을 뺀다. 조용히 엉뚱한 자리를
      // 가리키게 두는 것보다 낫다.
      if (!path) continue;
      const thumb = image.thumb_path
        ? copiedLibraryAssetPath(image.thumb_path, ownerUserId, newId) : null;
      moves.push({ from: image.path, to: path });
      if (image.thumb_path && thumb) moves.push({ from: image.thumb_path, to: thumb });
      planned.push({
        position: Number(image.position), path,
        mime: image.mime_type ?? "image/png", thumb,
      });
    }

    const moved = await moveAssets(admin, moves, BUCKET);
    uploaded.push(...moved);

    /*
      **못 옮긴 장은 행도 안 적는다.** 있다고 적어 두면 카드에는 「5장 묶음」
      인데 열면 넷이다. 작은 사본만 실패한 장은 살린다 — 사본이 없으면 화면이
      원본으로 떨어질 뿐이다(`_components/grid-src.ts`).
    */
    const rows = planned
      .filter((image) => moved.has(image.path))
      .map((image) => ({
        item_id: newId, user_id: ownerUserId, position: image.position,
        path: image.path, mime_type: image.mime,
        thumb_path: image.thumb && moved.has(image.thumb) ? image.thumb : null,
      }));

    /*
      **한 장도 못 옮겼으면 빈 작업을 남기지 않는다.** 원본에 그림이 있었는데
      전부 실패한 것은 저장소가 앓는 중이라는 뜻이다 — 그때 「복사했다」고
      말하면 사용자는 빈 작업을 보고 자기 것이 사라졌다고 읽는다.
    */
    if (source.length && !rows.length) throw new Error("그림을 옮기지 못했습니다.");

    // 3) 옮긴 자리를 적는다.
    if (rows.length) {
      const { error } = await admin.from("library_images").insert(rows);
      if (error) throw new Error(error.message);

      const cover = rows.find((row) => row.position === 0) ?? rows[0];
      const { error: coverError } = await admin
        .from("library_items")
        .update({
          image_count: rows.length,
          cover_path: cover?.path ?? null,
          cover_thumb_path: cover?.thumb_path ?? null,
        })
        .eq("id", newId);
      if (coverError) throw new Error(coverError.message);
    }

    return { id: newId };
  } catch (error) {
    /*
      **파일부터 지우고 행을 지운다.** 순서가 반대면 경로를 잃는다 —
      `saveLibraryItem` 이 같은 순서로 되돌린다.
    */
    if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded);
    await admin.from("library_items").delete().eq("id", newId);
    throw error;
  }
}

export async function copyCharacterToSelf(
  id: string,
  ownerUserId: string,
): Promise<{ id: string }> {
  const admin = createSupabaseAdminClient();

  const { data: source, error: readError } = await admin
    .from("characters").select("*").eq("id", id).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!source) throw new Error("원본을 찾을 수 없습니다.");

  // 1) 행을 먼저. 그림 자리는 새 캐릭터 id 가 있어야 정해진다.
  const { data: created, error: createError } = await admin.from("characters")
    .insert({
      user_id: ownerUserId,
      name: source.name,
      source_prompt: source.source_prompt,
      identity_prompt: source.identity_prompt,
      visual_style: source.visual_style,
      kind: source.kind,
      look: source.look,
    })
    .select("id").single();
  if (createError || !created) throw new Error(createError?.message ?? "복사하지 못했습니다.");
  await keepCopyPrivate(admin, "characters", created.id as string);

  // 2) 각도 그림을 새 자리로 옮긴다. 원본은 읽기만 한다.
  const { data: views } = await admin.from("character_views")
    .select("angle,path,thumb_path").eq("character_id", id);

  const moves: AssetMove[] = [];
  const rows: Array<Record<string, unknown>> = [];
  for (const view of (views ?? []) as Array<{ angle: string; path: string; thumb_path: string | null }>) {
    const path = copiedCharacterAssetPath(view.path, ownerUserId, created.id as string);
    if (!path) continue;
    const thumb = view.thumb_path
      ? copiedCharacterAssetPath(view.thumb_path, ownerUserId, created.id as string) : null;
    moves.push({ from: view.path, to: path });
    if (view.thumb_path && thumb) moves.push({ from: view.thumb_path, to: thumb });
    rows.push({
      character_id: created.id, user_id: ownerUserId,
      angle: view.angle, path, thumb_path: thumb,
    });
  }
  await moveAssets(admin, moves, CHARACTER_BUCKET);

  // 3) 옮긴 자리를 적는다.
  if (rows.length) {
    const { error } = await admin.from("character_views").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { id: created.id as string };
}

export async function copyWorkToSelf(
  kind: "sns" | "poster",
  id: string,
  ownerUserId: string,
): Promise<{ id: string }> {
  const admin = createSupabaseAdminClient();
  const source = await readAnyWork(kind, id);
  if (!source) throw new Error("원본을 찾을 수 없습니다.");

  if (kind === "sns") {
    const from = source as unknown as SnsProjectRecord;
    /*
      1) 행을 먼저. 그림 자리는 새 작업 id 가 있어야 정해진다.

      **경로를 비운 채로 만든다.** 원본 경로를 실어 두고 나중에 고치면, 그
      사이에 무엇이든 실패했을 때 **남의 파일을 가리키는 내 작업**이 남는다 —
      설계가 막겠다고 적은 바로 그 깨짐이다(소유 판정 어긋남, 원래 회원이
      지우면 같이 사라짐). 빈 경로로 두면 최악이 「그림 없는 내 작업」이다.
    */
    const blank = snsCopyPlan(from.data as unknown as Record<string, unknown>, "", "");
    const created = await createSupabaseSnsProjectRepository(admin).create({
      userId: ownerUserId,
      title: from.title,
      ratio: from.ratio,
      language: from.language,
      modelId: from.modelId,
      cardCountMode: from.cardCountMode,
      cardCount: from.cardCount,
      toneNote: from.toneNote,
      data: blank.data,
      slotPlan: from.slotPlan,
    } as SnsProjectCreateRecord);
    await keepCopyPrivate(admin, "sns_projects", created.id);

    // 2) 그림을 옮기고 3) 바뀐 경로를 적는다.
    const plan = snsCopyPlan(
      from.data as unknown as Record<string, unknown>, ownerUserId, created.id);
    await moveAssets(admin, plan.moves);
    /*
      **갱신 행 수를 센다.** `update` 는 한 줄도 안 맞아도 오류가 아니다 —
      `sns-flow-store.ts` 가 같은 함정으로 사고를 겪고 `select("id")` 로 세고
      있다. 여기서 안 세면 경로가 빈 채로 「복사 성공」이 된다.
    */
    const { data: touched, error } = await admin.from("sns_projects")
      .update({ data: { ...plan.data, slotPlan: from.slotPlan }, status: from.status })
      .eq("id", created.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!(touched ?? []).length) throw new Error("복사본에 그림 자리를 적지 못했습니다.");
    return { id: created.id };
  }

  const from = source as unknown as PosterProjectRecord;
  const { data: created, error: createError } = await admin.from("poster_projects")
    .insert(projectInsertRow(ownerUserId, {
      title: from.title,
      status: from.status,
      ratio: from.ratio,
      modelId: from.modelId,
      data: from.data,
    }))
    .select("id").single();
  if (createError || !created) throw new Error(createError?.message ?? "복사하지 못했습니다.");
  await keepCopyPrivate(admin, "poster_projects", created.id as string);

  const { data: images } = await admin.from("poster_images")
    .select("variant_index,selected,width,height,review,asset_path,thumb_path")
    .eq("project_id", id);

  /*
    **변형 행은 생성 요청을 가리켜야 한다** — 그 칸이 `not null` 이다
    (`202608310004_poster.sql:47`). 남의 장부 줄을 가리킬 수는 없으므로
    복사한 사람 소유로 하나 만든다.

    **비용은 0 이다.** 복사는 AI 를 안 부른다 — 0 이 아닌 값을 적으면 장부가
    쓰지 않은 돈을 세게 된다.
  */
  const { data: request, error: requestError } = await admin
    .from("poster_generation_requests")
    .insert({
      user_id: ownerUserId,
      project_id: created.id,
      model_id: from.modelId,
      ratio_id: from.ratio,
      mode: "t2i",
      size: {},
      requested_images: Math.min(Math.max((images ?? []).length, 1), 3),
      returned_images: (images ?? []).length,
      unit_cost_usd: 0,
      cost_usd: 0,
    })
    .select("id").single();
  if (requestError || !request) {
    throw new Error(requestError?.message ?? "복사하지 못했습니다.");
  }

  /*
    **`status` 를 따로 되살린다.** `projectInsertRow` 는 그 칸을 안 싣는다
    (회원에게 INSERT 권한이 없어 기본 `draft` 다). 그대로 두면 복사본이
    「쓰는 중」으로 시작해, 결과 그림을 참고용으로 보려던 뜻이 사라진다.
  */
  if (from.status && from.status !== "draft") {
    await admin.from("poster_projects")
      .update({ status: from.status }).eq("id", created.id);
  }

  const plan = posterCopyPlan(
    (images ?? []) as Array<{ variant_index: number; asset_path: string; thumb_path: string | null }>,
    ownerUserId, created.id as string, request.id as string);
  await moveAssets(admin, plan.moves);
  if (plan.rows.length) {
    const { error } = await admin.from("poster_images").insert(plan.rows);
    if (error) throw new Error(error.message);
  }
  return { id: created.id as string };
}

export async function deleteAnyWork(kind: "sns" | "poster", id: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();

  if (kind === "sns") {
    const { data } = await admin.from("sns_projects").select("data").eq("id", id).maybeSingle();
    if (!data) return false;
    // 회원 삭제와 **같은 규칙**을 쓴다. 두 길이 갈라지면 한쪽만 미리보기를 남긴다.
    const paths = snsCardPathsToRemove(
      ((data.data as { flow?: { cards?: Array<{ assetPath?: string; thumbPath?: string | null }> } })?.flow?.cards) ?? [],
    );

    // 카드 행은 FK cascade 가 지운다.
    const { error } = await admin.from("sns_projects").delete().eq("id", id);
    if (error) throw new Error(error.message);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    return true;
  }

  const { data: project } = await admin
    .from("poster_projects").select("id").eq("id", id).maybeSingle();
  if (!project) return false;

  // 경로를 행보다 먼저 읽어 둔다. 지우고 나면 어디에 있었는지 알 수 없다.
  const { data: images } = await admin
    .from("poster_images").select("asset_path,thumb_path").eq("project_id", id);
  // 회원 삭제와 **같은 규칙**을 쓴다. 두 길이 갈라지면 한쪽만 사본을 남긴다.
  const paths = posterAssetPathsToRemove(
    ((images ?? []) as Array<{ asset_path: string; thumb_path: string | null }>)
      .map((row) => ({ assetPath: row.asset_path, thumbPath: row.thumb_path })),
  );

  const { error } = await admin.from("poster_projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  return true;
}
