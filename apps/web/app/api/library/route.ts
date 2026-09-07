import {
  deleteLibraryItem,
  getLibraryItemImages,
  listLibraryItems,
  saveLibraryItem,
  type LibraryViewer,
} from "../../../lib/server-library";
import { authenticateApiMember } from "../../../lib/membership/api";
import { teamIdOf } from "../../../lib/teams/store";
import { originOf } from "./core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 섹션 여러 장을 한 번에 올린다. 장당 몇 MB라 넉넉히 잡는다.
export const maxDuration = 300;

// 한 작업에 담을 수 있는 이미지 수. 상세페이지 섹션이 보통 4~7장이다.
const MAX_IMAGES = 20;

/**
 * 사용자별 서버 라이브러리.
 *
 * 클라이언트가 보낸 userId 를 믿지 않는다 — 세션에서 꺼낸 것만 쓴다.
 * 그러지 않으면 남의 id 를 적어 보내는 것만으로 남의 작업물을 읽을 수 있다.
 *
 * **보기**: 회원은 자기 것만, 관리자는 전부. 작업물은 대부분 출시 전
 * 기획물이라 회원끼리 보이면 안 되지만, 운영자는 갤러리에 걸 것을 고르고
 * 신고를 확인할 수 있어야 한다.
 *
 * **지우기**: 관리자여도 자기 것만. 되돌릴 수 없는 일과 들여다보는 일은
 * 무게가 다르다.
 */

async function viewerOf(
  member: { userId: string; profile: { role: LibraryViewer["role"] } },
): Promise<LibraryViewer> {
  // 팀이 있으면 같은 팀 것이 함께 보인다. 팀이 없으면 `null` 이고 지금까지와
  // 똑같이 자기 것만 보인다.
  return { userId: member.userId, role: member.profile.role, teamId: await teamIdOf(member.userId) };
}

export async function GET(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const viewer = await viewerOf(auth.member);
  const itemId = new URL(req.url).searchParams.get("id");

  try {
    if (itemId) {
      return Response.json({ ok: true, images: await getLibraryItemImages(viewer, itemId) });
    }
    return Response.json({ ok: true, items: await listLibraryItems(viewer) });
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
      origin?: string;
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

    const tool = body.tool === "redesign" ? "redesign" : "create";
    const result = await saveLibraryItem({
      userId: auth.member.userId,
      title: String(body.title || "제목 없는 작업"),
      tool,
      origin: originOf(body.origin, tool),
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

    const result = await deleteLibraryItem(await viewerOf(auth.member), id);
    return Response.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
