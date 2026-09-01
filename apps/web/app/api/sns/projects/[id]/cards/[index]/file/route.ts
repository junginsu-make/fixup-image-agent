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

export async function GET(_request: Request, context: Context) {
  if (!isLocalStoreEnabled()) return new Response("Not found", { status: 404 });
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const { id, index: rawIndex } = await context.params;
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 1) return new Response("Not found", { status: 404 });
  const card = (await listLocalSnsCards(getLocalDatabase(), auth.member.userId, id)).find((entry) => entry.index === index);
  if (!card?.assetPath) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readLocalSnsResultFile(localStoreRoot(), card.assetPath);
    return new Response(Uint8Array.from(bytes), {
      headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
