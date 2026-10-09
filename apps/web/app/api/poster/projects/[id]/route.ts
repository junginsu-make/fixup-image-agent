import { hasFullScope, viewerFrom } from "../../../../../lib/access/core";
import { deleteAnyWork } from "../../../admin/works/store";
import { PosterSlotsSchema } from "@fixup/poster-core";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { errorLogText } from "../../../../../lib/easy/log-text";
import { posterStoresForUser } from "../../../../../lib/poster/stores";
import { createPosterService, PosterValidationError } from "../poster-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** 입력 검사 거절만 우리 문장이다. 저장소 원문(표 이름 등)은 서버 기록에만 남긴다(2026-10-07). */
function fail(error: unknown, fallback: string) {
  if (error instanceof PosterValidationError) {
    return Response.json({ ok: false, message: error.issues.join("\n"), issues: error.issues }, { status: 400 });
  }
  console.error(`[poster] ${fallback}`, errorLogText(error));
  return Response.json({ ok: false, message: fallback }, { status: 500 });
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
    if (hasFullScope(viewerFrom(auth.member), "delete")) {
      const removed = await deleteAnyWork("poster", id);
      if (!removed) return Response.json({ ok: false, message: "작업을 찾을 수 없습니다." }, { status: 404 });
      return Response.json({ ok: true });
    }
    const stores = posterStoresForUser(auth.member.userId);
    /*
      **회원이 지우면 지운 때만 적는다**(2026-10-08 사용자 결정). 줄과 그림 파일은 남아 관리자가 확인한다 —
      6개월 뒤 자동 파기. 그래서 여기서 파일을 지우지 않는다. 소유자가 아니면(팀원의 작업 등) 0줄이라 거절한다.
    */
    const removed = await createPosterService(stores.projects).remove(id);
    if (!removed) {
      return Response.json(
        { ok: false, message: "내가 만든 작업만 지울 수 있습니다." },
        { status: 403 },
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error, "이미지 작업을 지우지 못했습니다.");
  }
}
