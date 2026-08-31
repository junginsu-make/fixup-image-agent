import {
  deleteLibraryItem,
  getLibraryItemImages,
  listLibraryItems,
  saveLibraryItem,
} from "../../../lib/server-library";
import { authenticateApiMember } from "../../../lib/membership/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 섹션 여러 장을 한 번에 올린다. 장당 몇 MB라 넉넉히 잡는다.
export const maxDuration = 300;

// 한 작업에 담을 수 있는 이미지 수. 상세페이지 섹션이 보통 4~7장이다.
const MAX_IMAGES = 20;

/**
 * 사용자별 서버 라이브러리.
 *
 * 모든 경로에서 **로그인한 사용자 자신의 것만** 다룬다. 클라이언트가 보낸
 * userId 를 믿지 않는다 — 세션에서 꺼낸 것만 쓴다. 그러지 않으면 남의 id 를
 * 적어 보내는 것만으로 남의 작업물을 읽을 수 있다.
 */

export async function GET(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const itemId = new URL(req.url).searchParams.get("id");

  try {
    if (itemId) {
      return Response.json({
        ok: true,
        images: await getLibraryItemImages(auth.member.userId, itemId),
      });
    }
    return Response.json({ ok: true, items: await listLibraryItems(auth.member.userId) });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "라이브러리를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as {
      title?: string;
      tool?: string;
      aspectRatio?: string;
      images?: Array<{ base64?: string; mimeType?: string }>;
    };

    const images = (body.images ?? [])
      .slice(0, MAX_IMAGES)
      .map((image) => ({
        base64: String(image.base64 || "").replace(/^data:[^;]+;base64,/, ""),
        mimeType: String(image.mimeType || "image/png"),
      }))
      .filter((image) => image.base64.length > 0);

    if (images.length === 0) {
      return Response.json({ ok: false, message: "저장할 이미지가 없습니다." }, { status: 400 });
    }

    const result = await saveLibraryItem({
      userId: auth.member.userId,
      title: String(body.title || "제목 없는 작업"),
      tool: body.tool === "redesign" ? "redesign" : "create",
      aspectRatio: body.aspectRatio,
      images,
    });

    return result.ok
      ? Response.json(result)
      : Response.json(result, { status: 500 });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "저장하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as { id?: string };
    const id = String(body.id || "");
    if (!id) return Response.json({ ok: false, message: "id 가 없습니다." }, { status: 400 });

    const result = await deleteLibraryItem(auth.member.userId, id);
    return Response.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
