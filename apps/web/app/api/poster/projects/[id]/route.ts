import { rm } from "node:fs/promises";
import { deleteAnyWork } from "../../../admin/works/store";
import path from "node:path";
import { PosterSlotsSchema } from "@fixup/poster-core";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { isLocalStoreEnabled, localStoreRoot } from "../../../../../lib/local-store";
import { posterAssetPathsToRemove } from "../../../../../lib/poster/supabase-store-core";
import { posterStoresForUser } from "../../../../../lib/poster/stores";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { createPosterService, PosterValidationError } from "../poster-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 만들어 둔 그림 파일을 지운다.
 *
 * 파일이 남아도 화면에는 안 보인다. 그러니 여기서 실패해도 삭제 자체는 끝난
 * 것으로 본다 — 용량만 조금 차지할 뿐이다.
 *
 * 로컬은 디스크, 운영은 라이브러리 버킷. 경로 모양이 달라 각자 지운다.
 */
async function removePosterAssets(assetPaths: string[]) {
  if (!assetPaths.length) return;
  try {
    if (isLocalStoreEnabled()) {
      await Promise.all(assetPaths.map((assetPath) => rm(
        path.join(localStoreRoot(), "poster", ...assetPath.split("/")),
        { force: true },
      )));
      return;
    }
    await createSupabaseAdminClient().storage.from("library").remove(assetPaths);
  } catch {
    // 지우지 못해도 작업은 이미 사라졌다.
  }
}

function fail(error: unknown, fallback: string) {
  if (error instanceof PosterValidationError) {
    return Response.json({ ok: false, message: error.issues.join("\n"), issues: error.issues }, { status: 400 });
  }
  return Response.json(
    { ok: false, message: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ ok: true, project, images: await stores.images.byProject(id) });
  } catch (error) {
    return fail(error, "포스터 작업을 불러오지 못했습니다.");
  }
}

/** 사람이 슬롯을 고친다. 이게 04 단계의 목적이다. */
export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = PosterSlotsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: "슬롯 값을 확인해 주세요.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const { id } = await context.params;
    const service = createPosterService(posterStoresForUser(auth.member.userId).projects);
    return Response.json({ ok: true, project: await service.updateSlots(id, parsed.data) });
  } catch (error) {
    return fail(error, "슬롯을 저장하지 못했습니다.");
  }
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    // 관리자는 누구 것이든 지운다. 회원용 길을 넓히지 않고 따로 부른다.
    if (auth.member.profile.role === "admin") {
      const removed = await deleteAnyWork("poster", id);
      if (!removed) return Response.json({ ok: false, message: "작업을 찾을 수 없습니다." }, { status: 404 });
      return Response.json({ ok: true });
    }
    const stores = posterStoresForUser(auth.member.userId);
    // 행보다 먼저 경로를 읽어 둔다. 지우고 나면 어디에 있었는지 알 수 없다.
    // **사본도 함께 모은다.** 행이 사라지면 사본의 자리를 아는 곳이 없어진다.
    const paths = posterAssetPathsToRemove(await stores.images.byProject(id));
    await createPosterService(stores.projects).remove(id);
    await removePosterAssets(paths);
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error, "이미지 작업을 지우지 못했습니다.");
  }
}
