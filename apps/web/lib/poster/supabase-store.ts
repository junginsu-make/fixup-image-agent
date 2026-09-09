import "server-only";
import { signPaths } from "../storage/signing";

import type {
  PosterImageStore,
  PosterProjectStore,
  PosterReferenceStore,
  PosterRequestStore,
} from "@fixup/poster-core";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createSupabaseServerClient } from "../supabase/server";
import { scopedRead } from "../teams/scope";
import { teamIdOf } from "../teams/store";
import { selectedProjectFor } from "../teams/current-project";
import {
  imageInsertRows,
  projectInsertRow,
  projectPatchRow,
  requestInsertRow,
  toImageRecord,
  toProjectRecord,
  type PosterImageRow,
  type PosterProjectRow,
} from "./supabase-store-core";

/**
 * 포스터 저장소의 운영 구현.
 *
 * **회원 권한과 서버 권한을 나눠 쓴다.** 마이그레이션이 비용 장부와 이미지
 * 행의 쓰기를 회원에게서 회수했다. 그러니 읽기와 「어느 변형을 골랐나」는
 * 회원으로, 나머지 쓰기는 서버로 한다. 그 경계가 곧 회원이 비용을 고칠 수
 * 없다는 뜻이다.
 *
 * 표 ↔ 기록 변환은 `supabase-store-core.ts` 에 있다.
 */

const BUCKET = "library";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const PROJECT_COLUMNS = "id,user_id,title,status,ratio,model_id,data,created_at,updated_at";
const IMAGE_COLUMNS =
  "id,user_id,project_id,generation_request_id,variant_index,selected,asset_path,thumb_path,width,height,review,created_at";

function checked<T>(data: T, error: { message: string } | null, label: string): T {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function notFound(label: string): Error {
  return new Error(`${label} 항목을 찾을 수 없습니다.`);
}

/**
 * 이 사람이 볼 범위.
 *
 * 저장소를 만드는 함수(`posterStoresForUser`)를 async 로 바꾸지 않으려고
 * 여기서 그때그때 묻는다. 그 함수를 부르는 자리가 열네 곳이고 그중 여럿을
 * 지금 다른 작업이 고치고 있다 — 안 건드리는 편이 싸다.
 *
 * `isAdmin` 은 false 다. 이 길은 자기 작업을 만드는 화면이라 운영자라고
 * 전부 볼 이유가 없고, 운영자 전용 목록은 따로 있다.
 */
async function viewScope(userId: string) {
  return { userId, teamId: await teamIdOf(userId), isAdmin: false };
}

export function createSupabasePosterProjectStore(userId: string): PosterProjectStore {
  return {
    async list() {
      const client = await createSupabaseServerClient();
      let query = scopedRead(
        client.from("poster_projects").select(PROJECT_COLUMNS).order("updated_at", { ascending: false }),
        await viewScope(userId),
      );
      // 고른 갈래만 보여 준다. 한 건을 열 때(`get`)는 안 건다 — 주소로 받은
      // 작업이 갈래가 다르다고 안 열리면 더 놀랍다.
      const projectId = await selectedProjectFor(userId);
      if (projectId) query = query.eq("project_id", projectId);

      const { data, error } = await query;
      return checked((data ?? []) as PosterProjectRow[], error, "포스터 작업 목록").map(toProjectRecord);
    },
    async get(id) {
      const client = await createSupabaseServerClient();
      const { data, error } = await scopedRead(
        client.from("poster_projects").select(PROJECT_COLUMNS).eq("id", id),
        await viewScope(userId),
      ).maybeSingle();
      const row = checked(data as PosterProjectRow | null, error, "포스터 작업");
      return row ? toProjectRecord(row) : undefined;
    },
    async create(input) {
      const client = await createSupabaseServerClient();
      const { data, error } = await client.from("poster_projects")
        .insert(projectInsertRow(userId, input)).select(PROJECT_COLUMNS).single();
      return toProjectRecord(checked(data as PosterProjectRow, error, "포스터 작업 만들기"));
    },
    async update(id, patch) {
      const client = await createSupabaseServerClient();
      const { data, error } = await client.from("poster_projects")
        .update(projectPatchRow(patch, new Date().toISOString()))
        .eq("id", id).eq("user_id", userId).select(PROJECT_COLUMNS).maybeSingle();
      const row = checked(data as PosterProjectRow | null, error, "포스터 작업 고치기");
      if (!row) throw notFound("포스터 작업");
      return toProjectRecord(row);
    },
    async remove(id) {
      const client = await createSupabaseServerClient();
      const { error } = await client.from("poster_projects").delete().eq("id", id).eq("user_id", userId);
      checked(null, error, "포스터 작업 지우기");
    },
  };
}

/**
 * 포스터 레퍼런스는 **라이브러리의 참고 이미지를 그대로 쓴다.**
 *
 * 용도로 거르지 않는다. 올린 곳이 어디든 세 도구가 다 쓴다 — 거르면
 * "분명 올렸는데 여기선 안 보인다" 가 생긴다. 로컬 구현과 같은 판단이다.
 */
export function createSupabasePosterReferenceStore(userId: string): PosterReferenceStore {
  interface ReferenceRow {
    id: string; storage_path: string; title: string | null;
    width: number | null; height: number | null; created_at: string;
  }

  const withUrls = async (rows: ReferenceRow[]) => {
    if (!rows.length) return [];
    // 경로는 `user_id` 로 걸러 읽어 온 행에서 꺼낸 것이다. 서명을 서버
    // 권한으로 하는 이유는 `lib/storage/signing.ts` 에 적어 두었다.
    const urls = await signPaths(
      BUCKET,
      rows.map((row) => row.storage_path),
      SIGNED_URL_TTL_SECONDS,
    );
    return rows.map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      fileName: row.storage_path.split("/").pop() ?? "",
      title: row.title,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      url: urls.get(row.storage_path),
    }));
  };

  const columns = "id,storage_path,title,width,height,created_at";
  return {
    async list() {
      const client = await createSupabaseServerClient();
      const { data, error } = await scopedRead(
        client.from("reference_images").select(columns).order("created_at", { ascending: false }),
        await viewScope(userId),
      );
      return withUrls(checked((data ?? []) as ReferenceRow[], error, "참고 이미지 목록"));
    },
    async byIds(ids) {
      if (!ids.length) return [];
      const client = await createSupabaseServerClient();
      /**
       * **여기서는 조건이 유일한 방어선이다.**
       *
       * `reference_images` 의 RLS 는 아직 `using (true)` 다 — 회원 전원이
       * 읽는다. 그래서 이 조건을 빼면 남의 id 를 섞어 보내는 것만으로 남의
       * 참고 이미지가 나온다. 포스터 작업(`poster_projects`)과 달리 RLS 가
       * 받쳐 주지 않는다.
       */
      const { data, error } = await scopedRead(
        client.from("reference_images").select(columns).in("id", ids),
        await viewScope(userId),
      );
      return withUrls(checked((data ?? []) as ReferenceRow[], error, "참고 이미지"));
    },
  };
}

/** 비용 장부. 회원 권한으로는 못 쓴다 — 서버가 쓴다. */
export function createSupabasePosterRequestStore(userId: string): PosterRequestStore {
  return {
    async create(row) {
      const { data, error } = await createSupabaseAdminClient()
        .from("poster_generation_requests").insert(requestInsertRow(userId, row)).select("id").single();
      return checked(data as { id: string }, error, "포스터 비용 기록");
    },
    async complete(id, patch) {
      const { error } = await createSupabaseAdminClient()
        .from("poster_generation_requests")
        .update({
          fal_request_id: patch.falRequestId,
          returned_images: patch.returnedImages,
          cost_usd: patch.costUsd,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id).eq("user_id", userId);
      checked(null, error, "포스터 비용 확정");
    },
    /**
     * **소유자 조건을 함께 건다.** 남의 요청 행의 단가로 내 예약을 확정하는
     * 길을 남기지 않는다. 못 찾으면 `null` 이고, 부르는 쪽이 확정을 미룬다.
     */
    async unitCost(id) {
      const { data, error } = await createSupabaseAdminClient()
        .from("poster_generation_requests")
        .select("unit_cost_usd")
        .eq("id", id).eq("user_id", userId)
        .maybeSingle();
      if (error) return null;
      const value = (data as { unit_cost_usd: number | null } | null)?.unit_cost_usd;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    },
  };
}

export function createSupabasePosterImageStore(userId: string): PosterImageStore {
  return {
    /**
     * 그림은 **부모(작업)를 통해 보인다.**
     *
     * `poster_images` 에는 `team_id` 가 없다. 4단계에서 자식 정책을
     * 「부모가 보이면 자식도 보인다」로 세워 두었고, 이 길은 세션 클라이언트라
     * 그 정책이 그대로 걸린다 — 남의 `project_id` 를 적어 보내도 DB 가 막는다.
     *
     * 그래서 `user_id` 조건을 뗀다. 남겨 두면 팀원의 작업은 열리는데 그 안에
     * 그림만 안 보이는 상태가 된다.
     */
    async byProject(projectId) {
      const client = await createSupabaseServerClient();
      const { data, error } = await client.from("poster_images")
        .select(IMAGE_COLUMNS).eq("project_id", projectId)
        .order("variant_index", { ascending: true });
      return checked((data ?? []) as PosterImageRow[], error, "포스터 이미지 목록").map(toImageRecord);
    },
    async byProjects(projectIds) {
      if (!projectIds.length) return [];
      const client = await createSupabaseServerClient();
      const { data, error } = await client.from("poster_images")
        .select(IMAGE_COLUMNS).in("project_id", projectIds)
        .order("project_id", { ascending: true }).order("variant_index", { ascending: true });
      return checked((data ?? []) as PosterImageRow[], error, "포스터 이미지 목록").map(toImageRecord);
    },
    async add(rows) {
      if (!rows.length) return [];
      const { data, error } = await createSupabaseAdminClient()
        .from("poster_images").insert(imageInsertRows(userId, rows)).select(IMAGE_COLUMNS);
      return checked((data ?? []) as PosterImageRow[], error, "포스터 이미지 저장").map(toImageRecord);
    },
    async select(projectId, imageId) {
      const client = await createSupabaseServerClient();
      // 먼저 풀고 나서 건다. 부분 유니크 인덱스가 지연 검사를 못 한다.
      const cleared = await client.from("poster_images")
        .update({ selected: false }).eq("user_id", userId).eq("project_id", projectId).eq("selected", true);
      checked(null, cleared.error, "포스터 변형 풀기");
      const { data, error } = await client.from("poster_images")
        .update({ selected: true }).eq("id", imageId).eq("user_id", userId).eq("project_id", projectId)
        .select("id").maybeSingle();
      if (!checked(data as { id: string } | null, error, "포스터 변형 고르기")) throw notFound("포스터 이미지");
    },
    async saveReview(imageId, review) {
      const { data, error } = await createSupabaseAdminClient()
        .from("poster_images").update({ review }).eq("id", imageId).eq("user_id", userId)
        .select("id").maybeSingle();
      if (!checked(data as { id: string } | null, error, "포스터 검수 저장")) throw notFound("포스터 이미지");
    },
  };
}

export function supabasePosterStores(userId: string) {
  return {
    projects: createSupabasePosterProjectStore(userId),
    references: createSupabasePosterReferenceStore(userId),
    requests: createSupabasePosterRequestStore(userId),
    images: createSupabasePosterImageStore(userId),
  };
}
