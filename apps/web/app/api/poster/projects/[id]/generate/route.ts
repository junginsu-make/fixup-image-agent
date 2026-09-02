import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadUniqueReferences } from "../../../../../../lib/fal/upload";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { isLocalStoreEnabled, localStoreRoot } from "../../../../../../lib/local-store";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { submitPoster } from "../../../../../../lib/poster/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** 참고 이미지는 라이브러리 버킷에 있다. 포스터만의 버킷을 따로 두지 않는다. */
const LIBRARY_BUCKET = "library";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png",
};

/** 로컬·운영 모두 fal 업로드 URL 로 보낸다. 같은 모양이어야 나중에 다르게 동작하지 않는다. */
async function referenceBytes(storagePath: string): Promise<{ bytes: Buffer; contentType: string }> {
  const extension = path.extname(storagePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension] ?? "image/png";
  if (isLocalStoreEnabled()) {
    // 라이브러리의 참고 이미지와 같은 경로 규약이다: {user_id}/references/{id}.{ext}
    const file = path.join(localStoreRoot(), "library", ...storagePath.split("/"));
    return { bytes: await readFile(file), contentType };
  }
  const downloaded = await createSupabaseAdminClient().storage.from(LIBRARY_BUCKET).download(storagePath);
  if (downloaded.error || !downloaded.data) {
    throw new Error(downloaded.error?.message ?? "참고 이미지를 읽지 못했습니다.");
  }
  return { bytes: Buffer.from(await downloaded.data.arrayBuffer()), contentType };
}

export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });

    const fal = createPosterFalClients();
    // 따라 만들 것과 그대로 지킬 것을 함께 올린다. 순서가 프롬프트의
    // Image 번호와 같아야 하므로 레퍼런스를 먼저 둔다.
    const references = await stores.references.byIds(project.data.referenceIds);
    const preserved = await stores.references.byIds(project.data.preservedIds ?? []);
    // 같은 배치에서 같은 파일은 한 번만 올린다.
    const urls = await uploadUniqueReferences(
      [...references, ...preserved],
      (reference) => reference.id,
      async (reference) => {
        const { bytes, contentType } = await referenceBytes(reference.storagePath);
        return fal.uploader.uploadReference(bytes, contentType);
      },
    );

    const submission = await submitPoster(
      {
        projectId: id,
        modelId: project.modelId,
        ratioId: project.ratio,
        variants: project.data.variants,
        slots: project.data.slots,
        referenceUrls: references.map((reference) => urls[reference.id]!).filter(Boolean),
        preservedUrls: preserved.map((reference) => urls[reference.id]!).filter(Boolean),
        // 사람은 지키는 방법이 다르고, 얼굴이 둘이면 제3의 인물이 나온다.
        personUrls: preserved
          .filter((reference) => (project.data.personIds ?? []).includes(reference.id))
          .map((reference) => urls[reference.id]!)
          .filter(Boolean),
      },
      { queue: fal.queue, requests: stores.requests, images: stores.images, saveImage: async () => "" },
    );

    await stores.projects.update(id, { status: "generating" });
    return Response.json({ ok: true, submission });
  } catch (error) {
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "생성을 시작하지 못했습니다." },
      { status: 500 },
    );
  }
}
