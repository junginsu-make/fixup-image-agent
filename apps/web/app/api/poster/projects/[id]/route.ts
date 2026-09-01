import { PosterSlotsSchema } from "@fixup/poster-core";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../../lib/poster/stores";
import { createPosterService, PosterValidationError } from "../poster-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

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
    await createPosterService(posterStoresForUser(auth.member.userId).projects).remove(id);
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error, "포스터 작업을 지우지 못했습니다.");
  }
}
