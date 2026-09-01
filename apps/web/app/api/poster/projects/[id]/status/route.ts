import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { isLocalStoreEnabled, localStoreRoot } from "../../../../../../lib/local-store";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { collectPoster } from "../../../../../../lib/poster/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const StatusSchema = z.object({
  requestRowId: z.string(),
  falRequestId: z.string(),
  endpoint: z.string(),
  unitCostUsd: z.number(),
}).strict();

/** fal 이 준 URL 을 우리 저장소로 옮긴다. 그 URL 은 오래 살지 않는다. */
async function saveLocal(projectId: string, variantIndex: number, url: string): Promise<string> {
  if (!isLocalStoreEnabled()) throw new Error("운영 저장소는 배포 단계에서 연결합니다.");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`결과 이미지를 내려받지 못했습니다 (${response.status}).`);
  const storagePath = `${projectId}/${variantIndex}.png`;
  const target = path.join(localStoreRoot(), "poster", ...storagePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return storagePath;
}

/**
 * 상태를 물어보고, 끝났으면 회수한다.
 *
 * **상태 조회는 새 작업을 만들지 않는다.** 과금이 아니므로 화면이 주기적으로
 * 불러도 된다. 탭을 닫아도 request_id 가 장부에 남아 다시 열면 이어진다.
 */
export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = StatusSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ ok: false, message: "조회할 요청을 알려 주세요." }, { status: 400 });
  }
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const fal = createPosterFalClients();

    const result = await collectPoster(
      { projectId: id, ...parsed.data },
      {
        queue: fal.queue,
        requests: stores.requests,
        images: stores.images,
        saveImage: (projectId, variantIndex, url) => saveLocal(projectId, variantIndex, url),
      },
    );

    if (result.done) await stores.projects.update(id, { status: "done" });
    return Response.json({
      ok: true,
      done: result.done,
      images: await stores.images.byProject(id),
    });
  } catch (error) {
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "상태를 확인하지 못했습니다." },
      { status: 500 },
    );
  }
}
