import { authenticateApiMember } from "../../../../../lib/membership/api";
import {
  findLocalReferenceImage,
  getLocalDatabase,
  isLocalStoreEnabled,
  localStoreRoot,
  readLocalReferenceFile,
} from "../../../../../lib/local-store";

type Context = { params: Promise<{ id: string }> };

const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_request: Request, context: Context) {
  if (!isLocalStoreEnabled()) return new Response("Not found", { status: 404 });
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const image = await findLocalReferenceImage(getLocalDatabase(), auth.member.userId, id);
  if (!image) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readLocalReferenceFile(localStoreRoot(), image.storagePath);
    const extension = image.storagePath.slice(image.storagePath.lastIndexOf(".")).toLowerCase();
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "content-type": CONTENT_TYPE[extension] ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
