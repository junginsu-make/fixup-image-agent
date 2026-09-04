import "server-only";

import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { isLocalStoreEnabled } from "../../../../lib/local-store";
import { createSupabaseSnsProjectRepository } from "../../sns/projects/project-store";
import { collectCardPaths, withCardUrls } from "../../../../lib/sns/list-urls";
import {
  toImageRecord,
  toProjectRecord,
  type PosterImageRow,
  type PosterProjectRow,
} from "../../../../lib/poster/supabase-store-core";
import { ownerIdsOf, withOwner } from "./core";

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
    ...toProjectRecord(row),
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
export async function deleteAnyWork(kind: "sns" | "poster", id: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();

  if (kind === "sns") {
    const { data } = await admin.from("sns_projects").select("data").eq("id", id).maybeSingle();
    if (!data) return false;
    const paths = (((data.data as { flow?: { cards?: Array<{ assetPath?: string }> } })?.flow?.cards) ?? [])
      .flatMap((card) => (card.assetPath ? [card.assetPath] : []));

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
    .from("poster_images").select("asset_path").eq("project_id", id);
  const paths = ((images ?? []) as Array<{ asset_path: string }>).map((row) => row.asset_path);

  const { error } = await admin.from("poster_projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  return true;
}
