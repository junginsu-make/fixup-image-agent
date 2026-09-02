import { PosterProjectInputSchema } from "@fixup/poster-core";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../lib/poster/stores";
import { createPosterService, PosterValidationError } from "./poster-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string) {
  if (error instanceof PosterValidationError) {
    return Response.json({ ok: false, message: error.issues.join("\n"), issues: error.issues }, { status: 400 });
  }
  return Response.json(
    { ok: false, message: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const stores = posterStoresForUser(auth.member.userId);
    const projects = await createPosterService(stores.projects).list();
    // 라이브러리의 작업물 탭이 대표 그림을 세운다. 목록만 주면 만든 것이
    // 무엇인지 알 수 없어 "아직 그림이 없습니다" 만 뜬다.
    const images = await stores.images.byProjects(projects.map((project) => project.id));
    return Response.json({
      ok: true,
      projects: projects.map((project) => ({
        ...project,
        images: images.filter((image) => image.projectId === project.id),
      })),
    });
  } catch (error) {
    return fail(error, "포스터 작업을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = PosterProjectInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: "입력을 확인해 주세요.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    // 저장소가 세션 사용자에 이미 묶여 있다. 본문의 user_id 가 들어올 자리가 없다.
    const service = createPosterService(posterStoresForUser(auth.member.userId).projects);
    return Response.json({ ok: true, project: await service.create(parsed.data) }, { status: 201 });
  } catch (error) {
    return fail(error, "포스터 작업을 만들지 못했습니다.");
  }
}
