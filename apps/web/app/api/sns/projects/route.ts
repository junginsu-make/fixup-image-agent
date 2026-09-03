import { authenticateApiMember } from "../../../../lib/membership/api";
import { snsProjectServiceForUser } from "../../../../lib/repository-factory";
import { refreshProjectListAssetUrls } from "../../../../lib/sns/runtime";
import { ProjectValidationError } from "./project-service";
import { ProjectInputSchema } from "./schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const projects = await (await snsProjectServiceForUser(auth.member.userId)).list();
    // 저장소에는 경로만 있다. 볼 수 있는 주소는 열 때마다 새로 만든다 —
    // 안 하면 목록과 라이브러리 작업물에 "아직 그림이 없습니다" 만 뜬다.
    return Response.json({ ok: true, projects: await refreshProjectListAssetUrls(projects) });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = ProjectInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "프로젝트 입력을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const project = await (await snsProjectServiceForUser(auth.member.userId)).create(auth.member.userId, parsed.data);
    return Response.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectValidationError) {
      return Response.json({ ok: false, message: error.message, issues: error.issues }, { status: 400 });
    }
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "프로젝트를 만들지 못했습니다." }, { status: 500 });
  }
}
