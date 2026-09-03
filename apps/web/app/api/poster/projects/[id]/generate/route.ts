import { readFile } from "node:fs/promises";
import path from "node:path";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { IMAGE_MODELS, MATCH_SOURCE, chooseModelForRatio } from "@fixup/sns-core";
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

/**
 * 첨부한 그림의 실제 크기를 잰다.
 *
 * 표에도 width·height 칸이 있지만 비어 있을 때가 많다 — 옛 데이터에는 안
 * 채워져 있다. 파일을 직접 읽는 쪽이 확실하다.
 */
async function measure(
  reference: { storagePath: string } | undefined,
): Promise<{ width: number; height: number } | undefined> {
  if (!reference) return undefined;
  try {
    const { bytes } = await referenceBytes(reference.storagePath);
    const meta = await sharp(bytes).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : undefined;
  } catch {
    // 못 읽으면 아래에서 "크기를 읽지 못해" 로 거절된다.
    return undefined;
  }
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

    /**
     * 비율이 모델보다 우선한다.
     *
     * 모델마다 만들 수 있는 비율이 다르다. 사용자가 고른 모델이 그 비율을
     * 못 만들면 거절하는 대신 **만들 수 있는 모델로 바꾼다.** 원하는 모양이
     * 먼저이고 모델은 그것을 만들 도구다.
     *
     * 조용히 바꾸지는 않는다. 바꾼 이유를 응답에 실어 화면이 말하게 한다 —
     * 모델마다 값이 다르고 결과의 결도 다르다.
     */
    const choice = chooseModelForRatio(project.ratio, project.modelId, IMAGE_MODELS);

    // 첨부한 그림을 따라가는 비율이면 그 그림의 실제 크기를 읽는다.
    const sourceSize = project.ratio === MATCH_SOURCE
      ? await measure(references[0] ?? preserved[0])
      : undefined;

    const submission = await submitPoster(
      {
        projectId: id,
        modelId: choice.model.id,
        ratioId: project.ratio,
        sourceSize,
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
    return Response.json({
      ok: true,
      submission,
      // 바꿨으면 화면이 그대로 보여준다. 사용자는 자기가 고른 모델로 만든 줄 안다.
      ...(choice.switched ? { modelSwitchedTo: choice.model.id, notice: choice.reason } : {}),
    });
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
