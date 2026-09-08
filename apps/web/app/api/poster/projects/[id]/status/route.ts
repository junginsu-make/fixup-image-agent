import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { creditUnits } from "@fixup/shared";
import { authenticateApiMember, finalizeAiUsage } from "../../../../../../lib/membership/api";
import { isLocalStoreEnabled, localStoreRoot } from "../../../../../../lib/local-store";
import { makePosterThumbnail } from "../../../../../../lib/poster/thumbnail";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { collectPoster } from "../../../../../../lib/poster/flow";
import { posterAssetPath, posterThumbPath } from "../../../../../../lib/poster/supabase-store-core";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { markAsAi } from "../../../../../../lib/watermark";

/** 결과도 라이브러리 버킷에 둔다. 포스터만의 버킷을 따로 두지 않는다. */
const LIBRARY_BUCKET = "library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const StatusSchema = z.object({
  requestRowId: z.string(),
  falRequestId: z.string(),
  endpoint: z.string(),
  unitCostUsd: z.number(),
}).strict();

/**
 * fal 이 준 URL 을 우리 저장소로 옮긴다. 그 URL 은 오래 살지 않는다.
 *
 * 로컬은 디스크에, 운영은 라이브러리 버킷에 둔다. 경로 모양이 다르다 —
 * 버킷 정책이 경로 첫 칸으로 소유자를 판정하므로 운영 경로는 사용자로
 * 시작해야 한다. 어느 쪽이든 화면은 같은 주소로 읽는다.
 */
/**
 * 목록에 걸 사본을 만들어 둔다. 자리를 돌려주고, 못 만들면 `null` 이다.
 *
 * **사본 하나 때문에 결과물을 잃지 않는다.** 없으면 화면이 원본으로 떨어진다.
 */
async function saveThumbnail(
  bytes: Buffer,
  target: string,
  put: (path: string, body: Buffer) => Promise<string | null>,
): Promise<string | null> {
  const thumbnail = await makePosterThumbnail(bytes);
  if (!thumbnail) return null;
  return put(target, thumbnail);
}

/**
 * 결과 한 장을 저장한다. 원본과 목록용 사본의 자리를 함께 돌려준다.
 *
 * **원본의 이름 규칙(`.png`)은 손대지 않는다** — 사본은 별개 파일이라 이미
 * 쌓인 것들이 그대로 열려야 한다.
 */
async function saveResult(
  userId: string, projectId: string, variantIndex: number, url: string,
): Promise<{ assetPath: string; thumbPath: string | null }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`결과 이미지를 내려받지 못했습니다 (${response.status}).`);
  // 만든 그림이므로 "AI 이미지" 를 파일에 새기고 저장한다.
  const bytes = await markAsAi(Buffer.from(await response.arrayBuffer()));

  if (isLocalStoreEnabled()) {
    const root = path.join(localStoreRoot(), "poster");
    const write = async (storagePath: string, body: Buffer) => {
      const target = path.join(root, ...storagePath.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
      return storagePath;
    };
    const assetPath = await write(`${projectId}/${variantIndex}.png`, bytes);
    const thumbPath = await saveThumbnail(bytes, `${projectId}/${variantIndex}.thumb.webp`, write);
    return { assetPath, thumbPath };
  }

  const storage = createSupabaseAdminClient().storage.from(LIBRARY_BUCKET);
  const assetPath = posterAssetPath(userId, projectId, variantIndex);
  const result = await storage.upload(assetPath, bytes, { contentType: "image/png", upsert: true });
  if (result.error) throw new Error(result.error.message);

  const thumbPath = await saveThumbnail(
    bytes,
    posterThumbPath(userId, projectId, variantIndex),
    async (target, body) => {
      const uploaded = await storage.upload(target, body, { contentType: "image/webp", upsert: true });
      if (!uploaded.error) return target;
      // 자리를 비워 두면 원본으로 떨어진다.
      console.error(`[poster] 사본을 올리지 못했습니다: ${uploaded.error.message}`);
      return null;
    },
  );
  return { assetPath, thumbPath };
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
        saveImage: (projectId, variantIndex, url) =>
          saveResult(auth.member.userId, projectId, variantIndex, url),
      },
    );

    /**
     * **결과를 받았으면 그때 장부를 확정한다.**
     *
     * 예약은 만들기 요청이 「변형 N장」으로 잡아 뒀다. fal 이 덜 돌려주면 그만큼만
     * 받아야 하므로, 실제로 저장된 장수로 다시 센다.
     *
     * **열쇠를 지운다.** 남겨 두면 다음 만들기가 옛 열쇠로 확정해 두 번 깎이거나
     * 엉뚱한 요청을 닫는다.
     *
     * 확정이 실패해도 결과는 돌려준다 — 그림은 이미 저장됐고, 묶인 장은 예약이
     * 만료되면 풀린다. 여기서 막으면 사용자가 만든 그림을 못 본다.
     */
    if (result.done) {
      const project = await stores.projects.get(id);
      const saved = await stores.images.byProject(id);
      const unitUsd = parsed.data.unitCostUsd;
      const reservationId = project?.data.reservationId;
      if (reservationId) {
        try {
          await finalizeAiUsage(
            { userId: auth.member.userId, requestId: reservationId },
            saved.length > 0,
            creditUnits(unitUsd * saved.length),
          );
        } catch {
          // 삼킨다. 사용자가 만든 그림을 못 보는 것이 더 나쁘다.
        }
      }
      await stores.projects.update(id, {
        status: "done",
        ...(project ? { data: { ...project.data, reservationId: undefined } } : {}),
      });
    }
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
