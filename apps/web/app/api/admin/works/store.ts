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
