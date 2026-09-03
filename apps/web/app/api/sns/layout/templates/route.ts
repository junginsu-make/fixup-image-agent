import { z } from "zod";
import { DEFAULT_TEMPLATES, SlotListSchema, validateTemplate } from "@fixup/layout-core";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { listSavedTemplates, saveTemplate } from "../../../../../lib/layout/template-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SaveInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(["cover", "body", "ending"]),
  slots: SlotListSchema,
});

/**
 * 고를 수 있는 뼈대 전부.
 *
 * 기본 목록은 코드에 있고 저장한 것만 표에 있다. 화면은 둘을 한 목록으로
 * 본다 — 어디에 저장돼 있는지는 고르는 사람의 관심사가 아니다.
 */
export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const saved = await listSavedTemplates(auth.member.userId);
    return Response.json({ ok: true, defaults: DEFAULT_TEMPLATES, saved });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "뼈대 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = SaveInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: "뼈대 입력을 확인해 주세요.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 카드 밖으로 나간 칸을 저장해 두면 쓸 때마다 같은 카드가 깨진다. 여기서 막는다.
  const problems = validateTemplate({ id: "new", ...parsed.data })
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  if (problems.length) {
    return Response.json({ ok: false, message: problems.join(" "), issues: problems }, { status: 400 });
  }

  try {
    const template = await saveTemplate(auth.member.userId, parsed.data);
    return Response.json({ ok: true, template }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "뼈대를 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
