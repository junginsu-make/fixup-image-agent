import { z } from "zod";
import { authenticateApiMember } from "../../../lib/membership/api";
import {
  getLocalDatabase,
  insertLocalReferenceImage,
  isLocalStoreEnabled,
  listLocalReferenceImages,
  localStoreRoot,
  removeLocalReferenceFiles,
  writeLocalReferenceFile,
} from "../../../lib/local-store";
import { ReferencePurposeSchema } from "../reference-sets/schema";
import { persistReferenceImage } from "../../library/reference-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

function localOnly() {
  return Response.json({ ok: false, message: "로컬 파일 저장소가 켜져 있지 않습니다." }, { status: 404 });
}

function view(image: Awaited<ReturnType<typeof listLocalReferenceImages>>[number]) {
  return { ...image, signedUrl: `/api/reference-images/${image.id}/file` };
}

export async function GET() {
  if (!isLocalStoreEnabled()) return localOnly();
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const images = await listLocalReferenceImages(getLocalDatabase(), auth.member.userId);
    return Response.json({ ok: true, images: images.map(view) });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "참고 이미지를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isLocalStoreEnabled()) return localOnly();
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const form = await request.formData();
    const id = IdSchema.parse(form.get("id"));
    const title = z.string().max(200).parse(form.get("title") ?? "");
    const purpose = ReferencePurposeSchema.parse(form.get("purpose"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("이미지 파일을 골라 주세요.");
    const database = getLocalDatabase();
    const root = localStoreRoot();
    const image = await persistReferenceImage(
      { file, title, purpose },
      {
        createId: () => id,
        getUserId: async () => auth.member.userId,
        upload: (storagePath, selected) => writeLocalReferenceFile(root, storagePath, selected),
        insert: (row) => insertLocalReferenceImage(database, auth.member.userId, {
          id: row.id,
          storagePath: row.storage_path,
          title: row.title,
          purpose: row.purpose,
          width: null,
          height: null,
        }),
        remove: (storagePaths) => removeLocalReferenceFiles(root, storagePaths),
      },
    );
    return Response.json({ ok: true, image: view(image) }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "참고 이미지를 올리지 못했습니다." }, { status: 400 });
  }
}
