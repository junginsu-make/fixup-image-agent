import { PosterProjectInputSchema } from "@fixup/poster-core";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { errorLogText } from "../../../../lib/easy/log-text";
import { posterStoresForUser } from "../../../../lib/poster/stores";
import { createPosterService, PosterValidationError } from "./poster-service";
import { carriedCharactersForPosterPeople } from "../../../../lib/carried-characters-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 입력 검사 거절만 우리 문장이다. 저장소 원문(표 이름 등)은 서버 기록에만 남긴다(2026-10-07). */
function fail(error: unknown, fallback: string) {
  if (error instanceof PosterValidationError) {
    return Response.json({ ok: false, message: error.issues.join("\n"), issues: error.issues }, { status: 400 });
  }
  console.error(`[poster] ${fallback}`, errorLogText(error));
  return Response.json({ ok: false, message: fallback }, { status: 500 });
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
    /*
      사람으로 지킬 그림이 캐릭터의 각도면 그 캐릭터의 종류·그림체·생김새를 적어 둔다
      (2026-10-07, ③). 이 화면은 캐릭터 번호를 안 들고 다녀 제목으로 찾는다 — 화면이
      「같은 캐릭터」를 알아보는 방법(`characterIdByTitle`)과 같다.
    */
    const characters = await carriedCharactersForPosterPeople(auth.member, parsed.data.personIds);
    return Response.json({ ok: true, project: await service.create(parsed.data, characters) }, { status: 201 });
  } catch (error) {
    return fail(error, "포스터 작업을 만들지 못했습니다.");
  }
}
