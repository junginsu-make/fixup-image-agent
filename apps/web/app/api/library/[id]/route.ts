import { authenticateApiMember } from "../../../../lib/membership/api";
import { getLibraryItem, getLibraryItemImages } from "../../../../lib/server-library";
import { teamIdOf } from "../../../../lib/teams/store";
import { selectedProjectFor } from "../../../../lib/teams/current-project";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 계정 보관 작업 한 건. **과정과 낱장을 함께 준다.**
 *
 * 목록(`../route.ts`)은 표지만 싣는다 — 한 줄마다 기획안과 스무 장이 딸려
 * 오면 라이브러리를 여는 것만으로 수 MB 가 오간다. 그 무게가 사용자가
 * 「끊긴다」고 말한 증상이었다(2026-09-16).
 *
 * 그래서 화면 하나를 열 때만 여기로 온다. 두 번 묻지 않도록 한 번에 준다 —
 * 작업 정보와 그림을 따로 물으면 화면이 두 단계로 나타난다.
 *
 * **남의 것이면 404 다.** 범위 판단은 `canSeeItem` 한 곳이 한다. 관리자가
 * 남의 것을 보는 길은 따로 있다(`api/admin/works/library/{id}`) — 한 주소에서
 * 조건 하나로 갈리면 언젠가 그 조건이 어긋나 회원에게 남의 작업이 샌다.
 */
export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const viewer = {
      userId: auth.member.userId,
      role: auth.member.profile.role,
      teamId: await teamIdOf(auth.member.userId),
      projectId: await selectedProjectFor(auth.member.userId),
    };

    const work = await getLibraryItem(viewer, id);
    if (!work) {
      return Response.json({ ok: false, message: "작업을 찾을 수 없습니다." }, { status: 404 });
    }

    return Response.json({ ok: true, work, images: await getLibraryItemImages(viewer, id) });
  } catch (error) {
    // DB 오류 문구를 화면에 흘리지 않는다. 제약 이름·칼럼명이 그대로 나간다.
    console.error("[library/:id]", error);
    return Response.json({ ok: false, message: "작업을 불러오지 못했습니다." }, { status: 500 });
  }
}
