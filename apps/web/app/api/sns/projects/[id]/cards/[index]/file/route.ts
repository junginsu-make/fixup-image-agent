import { authenticateApiMember } from "../../../../../../../../lib/membership/api";
import {
  getLocalDatabase,
  isLocalStoreEnabled,
  listLocalSnsCards,
  localStoreRoot,
  readLocalSnsResultFile,
} from "../../../../../../../../lib/local-store";

type Context = { params: Promise<{ id: string; index: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: Context) {
  if (!isLocalStoreEnabled()) return new Response("Not found", { status: 404 });
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const { id, index: rawIndex } = await context.params;
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 1) return new Response("Not found", { status: 404 });
  const card = (await listLocalSnsCards(getLocalDatabase(), auth.member.userId, id)).find((entry) => entry.index === index);
  if (!card?.assetPath) return new Response("Not found", { status: 404 });

  /**
   * `?size=thumb` 이면 미리보기를 준다.
   *
   * **없으면 원본으로 떨어진다.** 이미 만든 카드에는 미리보기가 없고, 자리는
   * 적혀 있는데 파일만 사라질 수도 있다.
   */
  const wantsThumb = new URL(request.url).searchParams.get("size") === "thumb";
  const thumbPath = wantsThumb ? card.thumbPath ?? null : null;

  try {
    let bytes: Buffer | null = null;
    let servedThumb = false;
    if (thumbPath) {
      bytes = await readLocalSnsResultFile(localStoreRoot(), thumbPath).catch(() => null);
      servedThumb = bytes !== null;
    }
    if (!bytes) bytes = await readLocalSnsResultFile(localStoreRoot(), card.assetPath);

    return new Response(Uint8Array.from(bytes), {
      headers: {
        "content-type": servedThumb ? "image/webp" : "image/png",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
