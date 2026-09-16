import { authenticateApiMember } from "../../../../lib/membership/api";
import { listCharacters } from "../../../../lib/characters";
import { teamIdOf } from "../../../../lib/teams/store";
import { pickCharacter } from "../../../characters/pick-character";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 캐릭터 한 장.
 *
 * **새 질의를 쓰지 않는다.** `listCharacters` 가 팀 범위·각도 짝짓기·서명
 * 주소까지 이미 다 해 준다. 단건용 질의를 따로 만들면 그 규칙이 두 군데로
 * 갈리고 언젠가 한쪽만 고쳐진다 — 이 저장소가 반복해서 당한 방식이다.
 *
 * 캐릭터는 한 사람당 많아야 수십 개라 목록을 받아 거르는 값이 싸다. 수백
 * 개가 되면 그때 단건 질의를 만든다.
 *
 * 남의 것이면 목록에 없으므로 **404** 가 된다. 관리자는 별도 통로로 읽는다
 * (`api/admin/works` 와 같은 갈래).
 */
export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const characters = await listCharacters(
      auth.member.userId, await teamIdOf(auth.member.userId));
    const character = pickCharacter(characters, id);
    if (!character) {
      return Response.json({ ok: false, message: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
    }
    return Response.json({ ok: true, character });
  } catch (error) {
    // DB 오류 문구를 화면에 흘리지 않는다. 서버 로그에 남긴다.
    console.error("[characters/:id]", error);
    return Response.json({ ok: false, message: "캐릭터를 불러오지 못했습니다." }, { status: 500 });
  }
}
