import { canEdit, planEditJob } from "@fixup/poster-core";
import { z } from "zod";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { submitPoster } from "../../../../../../lib/poster/flow";
import { posterImageBytes } from "../../../../../../lib/poster/asset-bytes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const EditSchema = z.object({
  instruction: z.string().trim().min(1, "무엇을 고칠지 적어 주세요."),
  /** 다른 비율로 다시 만들 때만 준다. */
  ratioId: z.string().optional(),
}).strict();

/**
 * 고른 변형을 기준으로 고친다.
 *
 * **처음부터 다시 만들지 않는다.** 고른 이미지를 레퍼런스로 넣어야 애써 고른
 * 것이 유지된다. 수정은 한 장만 만든다 — 세 장을 또 받으면 고르는 일이 반복된다.
 */
export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = EditSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "수정 지시를 확인해 주세요." },
      { status: 400 },
    );
  }
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });

    const images = await stores.images.byProject(id);
    if (!canEdit(images)) {
      return Response.json(
        { ok: false, message: "먼저 고칠 변형 하나를 고르세요." },
        { status: 400 },
      );
    }
    const parent = images.find((image) => image.selected)!;

    /**
     * 고친 기준이 될 그림을 **fal 에 올려서** 넘긴다.
     *
     * 전에는 `/api/poster/.../file` 주소를 그대로 넘겼다. 그 길은 회원
     * 확인을 거치는데 fal 에는 로그인 쿠키가 없다 — 401 이 떨어지고, fal 은
     * 기준 그림 없이 일을 붙들고 있어 화면에는 「고치는 중」만 계속 떴다
     * (2026-09-04 사용자 보고). 첫 생성은 처음부터 바이트를 올리고 있었다.
     */
    const { bytes, contentType } = await posterImageBytes(parent.assetPath);
    const fal = createPosterFalClients();
    const parentUrl = await fal.uploader.uploadReference(bytes, contentType);

    const job = planEditJob({
      projectId: id,
      parentImageId: parent.id,
      parentUrl,
      instruction: parsed.data.instruction,
      modelId: project.modelId,
      ratioId: parsed.data.ratioId ?? project.ratio,
      slots: project.data.slots,
    });

    const submission = await submitPoster(job, {
      queue: fal.queue, requests: stores.requests, images: stores.images, saveImage: async () => "",
    });
    return Response.json({ ok: true, submission });
  } catch (error) {
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "고치지 못했습니다." },
      { status: 400 },
    );
  }
}
