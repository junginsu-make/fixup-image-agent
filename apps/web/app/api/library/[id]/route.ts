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
 * **범위 판단은 `canSeeItem` 한 곳이 한다.** 회원은 자기 것과 같은 팀 것까지,
 * 관리자는 전부다(`lib/server-library.ts` 의 `readScope`). 그래서 관리자는 이
 * 회원용 길로도 남의 것을 본다 — 「관리자는 관리자 길로만 온다」가 아니다.
 *
 * 그럼에도 관리자 길을 따로 두는 것은(`api/admin/works/library/{id}`) 이 길의
 * 조건이 언젠가 좁아져도 관리자 화면이 안 깨지게 하려는 것이고, 무엇보다
 * **회원용 길에 「관리자면 조건을 뺀다」를 심지 않기 위해서다** — 그 조건이
 * 어긋나는 날이 회원에게 남의 작업이 새는 날이다.
 *
 * 못 볼 것이면 404 다. 없는 id 와 답이 같아 존재 여부가 안 샌다.
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
