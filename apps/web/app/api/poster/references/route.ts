import { hasFullScope, viewerFrom } from "../../../../lib/access/core";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { posterReferences } from "../../../../lib/poster/references";
import { teamIdOf } from "../../../../lib/teams/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 이미지 만들기 02 에 거는 참고 이미지.
 *
 * **라이브러리와 같은 목록을 준다**(2026-09-17 사용자 결정). 전에는 이 주소만
 * 저만의 질의를 써서 「내 것 + 내 팀 것」만 줬고, 그래서 카드뉴스·캐릭터·광고에
 * 보이던 공용 그림이 여기서만 없었다. 관리자도 여기서만 남의 것을 못 봤다.
 *
 * 팀은 **세션에서 꺼낸다.** 본문이나 주소로 받으면 남의 팀 ID 를 적어 보내는
 * 것만으로 남의 본보기를 볼 수 있다.
 */
export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const references = await posterReferences({
      userId: auth.member.userId,
      role: auth.member.profile.role,
      teamId: await teamIdOf(auth.member.userId),
    });
    /*
      **「남의 것에도 지우기를 낼까」를 서버가 정한다.** 라이브러리 목록이 이미
      같은 값을 준다(`api/reference-images/route.ts`). 화면이 스스로 판단하면
      서버의 실제 판정(`canModifyReferenceImage`)과 갈려, 눌러도 안 되는 단추가
      뜬다.
    */
    return Response.json({
      ok: true,
      references,
      isAdmin: hasFullScope(viewerFrom(auth.member), "delete"),
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "레퍼런스를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
