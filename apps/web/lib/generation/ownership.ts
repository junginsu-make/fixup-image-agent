import "server-only";
import { isLocalStoreEnabled } from "../local-store";
import { createSupabaseAdminClient } from "../supabase/admin";

export class ProjectWriteDenied extends Error {
  constructor() { super("본인이 만든 작업만 변경할 수 있습니다."); this.name = "ProjectWriteDenied"; }
}

/** Caller is an authenticated member. Reading a shared project is not permission to spend on it. */
export async function assertProjectWrite(userId: string, kind: "sns" | "poster", projectId: string) {
  // Local repositories already load projects in the specified user's namespace.
  if (isLocalStoreEnabled()) return;
  const { data, error } = await createSupabaseAdminClient().from(kind === "sns" ? "sns_projects" : "poster_projects")
    .select("id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("작업 소유권을 확인하지 못했습니다.");
  if (!data) throw new ProjectWriteDenied();
}

export function projectWriteDeniedResponse(error: unknown) {
  if (!(error instanceof ProjectWriteDenied)) return undefined;
  return Response.json({ ok: false, message: error.message }, { status: 403 });
}

/** JSON is an input, not authority to sign arbitrary private Storage objects. */
export async function assertReadableAssetPaths(userId: string, paths: readonly string[]) {
  if (isLocalStoreEnabled() || paths.length === 0) return;
  const unique = [...new Set(paths)];
  const { data, error } = await createSupabaseAdminClient().rpc("accessible_generation_asset_paths", { p_actor: userId, p_paths: unique });
  if (error) throw new Error("첨부 파일 접근 권한을 확인하지 못했습니다.");
  const allowed = new Set((data as Array<{ path: string }> | null ?? []).map(row => row.path));
  if (unique.some(p => !allowed.has(p))) throw new ProjectWriteDenied();
}
