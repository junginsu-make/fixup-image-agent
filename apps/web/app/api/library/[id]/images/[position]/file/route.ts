import { authenticateApiMember } from "../../../../../../../lib/membership/api";
import { toPng } from "../../../../../../../lib/image-encoding";
import { getLibraryImageFile } from "../../../../../../../lib/server-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; position: string }> };

/**
 * 라이브러리 그림 한 장을 내려 준다.
 *
 * **화면에 띄우는 길이 아니다.** 목록과 뷰어는 지금처럼 Storage 서명 URL 을
 * 그대로 쓴다. 이 길은 내려받기 전용이다 — 저장은 WebP 로 하지만 받는 파일은
 * 예전 그대로 PNG 여야 하고, 그러려면 우리 손을 한 번 거쳐야 한다.
 *
 * `?format=png` 로만 되돌린다. 무손실로 넣었으므로 되돌린 픽셀은 원본과
 * 완전히 같다 — 손실로 저장했다면 이 되돌리기가 거짓말이 됐을 것이다.
 *
 * **파일 이름을 작업 제목에서 만들지 않는다.** 제목은 사용자가 적은 문자열이
 * 다듬어지지 않은 채 표에 들어가므로, 헤더에 그대로 넣으면 따옴표를 끼워
 * 받는 파일의 이름과 확장자를 바꿔 놓을 수 있다.
 */
export async function GET(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const { id, position } = await context.params;
  const index = Number(position);
  if (!Number.isInteger(index) || index < 0) {
    return new Response("찾을 수 없습니다.", { status: 404 });
  }

  try {
    const file = await getLibraryImageFile(
      { userId: auth.member.userId, role: auth.member.profile.role },
      id,
      index,
    );
    if (!file) return new Response("찾을 수 없습니다.", { status: 404 });

    const wantsPng = new URL(request.url).searchParams.get("format") === "png";
    const bytes = wantsPng ? await toPng(file.bytes) : file.bytes;
    const contentType = wantsPng ? "image/png" : file.mimeType;
    const extension = wantsPng ? "png" : (contentType.split("/")[1] ?? "bin");

    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${id}-${index}.${extension}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=60",
      },
    });
  } catch {
    return new Response("이미지를 읽지 못했습니다.", { status: 500 });
  }
}
