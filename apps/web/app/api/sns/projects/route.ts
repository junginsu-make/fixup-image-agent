import { authenticateApiMember } from "../../../../lib/membership/api";
import { snsProjectServiceForUser } from "../../../../lib/repository-factory";
import { ProjectValidationError } from "./project-service";
import { ProjectInputSchema } from "./schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, projects: await (await snsProjectServiceForUser(auth.member.userId)).list() });
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
