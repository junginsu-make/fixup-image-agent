import { planSelection } from "@fixup/poster-core";
import { z } from "zod";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const SelectSchema = z.object({ imageId: z.string().uuid() }).strict();

/**
 * 변형 하나를 고른다.
 *
 * **먼저 풀고 나서 건다.** DB 의 부분 유니크 인덱스가 지연 검사를 못 하므로
 * 순서가 뒤집히면 제약 위반이 난다. `planSelection` 이 그 순서를 정한다.
 */
export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = SelectSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ ok: false, message: "고를 이미지를 알려 주세요." }, { status: 400 });
  }
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const images = await stores.images.byProject(id);
    const steps = planSelection(id, images, parsed.data.imageId);
    if (steps.length) await stores.images.select(id, parsed.data.imageId);
    return Response.json({ ok: true, images: await stores.images.byProject(id) });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "변형을 고르지 못했습니다." },
      { status: 400 },
    );
  }
}
