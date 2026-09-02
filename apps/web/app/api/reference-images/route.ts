import { z } from "zod";
import { authenticateApiMember } from "../../../lib/membership/api";
import { listReferenceImages, localFileUrl, saveReferenceImage } from "../../../lib/reference-images";
import { isLocalStoreEnabled } from "../../../lib/local-store";
import { ReferencePurposeSchema } from "../reference-sets/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

/**
 * 라이브러리의 참고 이미지.
 *
 * 로컬이든 운영이든 이 길 하나만 쓴다. 전에는 로컬에서만 열리고 운영에서는
 * 404 였는데, 그걸 부르던 화면은 실패를 조용히 삼켜 "저장된 이미지가 없다"로
 * 보였다.
 */

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, images: await listReferenceImages(auth.member.userId) });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "참고 이미지를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const form = await request.formData();
    const id = IdSchema.parse(form.get("id"));
    const title = z.string().max(200).parse(form.get("title") ?? "");
    const purpose = ReferencePurposeSchema.parse(form.get("purpose"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("이미지 파일을 골라 주세요.");

    const image = await saveReferenceImage({
      userId: auth.member.userId,
      id,
      title,
      purpose,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
    });

    // 로컬은 서명 URL 이 없어 자체 경로로 내려 준다. 운영은 목록을 다시
    // 부를 때 서명 URL 이 붙는다.
    return Response.json(
      { ok: true, image: { ...image, signedUrl: isLocalStoreEnabled() ? localFileUrl(image.id) : null } },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "참고 이미지를 올리지 못했습니다." },
      { status: 400 },
    );
  }
}
