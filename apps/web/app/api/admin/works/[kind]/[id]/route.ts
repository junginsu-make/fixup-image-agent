import { authenticateApiAdmin } from "../../../../../../lib/membership/api";
import { readAnyCharacter, readAnyWork, readAnyWorkImages } from "../../store";

type Context = { params: Promise<{ kind: string; id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 작업 한 건. **관리자만.**
 *
 * 라이브러리 목록은 관리자에게 남의 작업까지 보여 주는데(`../../route.ts`),
 * 눌러서 여는 단계별 화면은 회원용 경로라 RLS 를 탄다. `same_team` 에 관리자
 * 예외가 없어(`supabase/migrations/202609070003_team_rls.sql:43`) 남의 작업은
 * 404 였다 — **보이는데 못 여는** 상태였다.
 *
 * **관문이 조회보다 먼저다.** 관리자가 아니면 id 를 보기도 전에 403 으로
 * 끝나므로, 어떤 id 를 넣어도 답이 같다 — 존재 여부가 새지 않는다.
 * 관리자에게만 「없다(404)」와 「있다(200)」가 갈린다.
 *
 * 회원용 목록과 주소를 나눈 까닭은 형제 라우트에 적어 두었다 — 한 주소에서
 * 물음표 하나로 갈리면 언젠가 그 조건이 어긋나 남의 작업이 새 나간다.
 */
export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;

  const { kind, id } = await context.params;
  if (kind !== "sns" && kind !== "poster" && kind !== "character") {
    return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
  }

  try {
    /*
      캐릭터는 작업이 아니라 **설정과 결과물**이라 모양이 다르다. 목록과 같은
      함수에 「전체」 범위를 주어 읽으므로 그림 주소도 이미 채워져 온다.
    */
    if (kind === "character") {
      const character = await readAnyCharacter(id);
      if (!character) {
        return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
      }
      return Response.json({ ok: true, work: character, images: [] });
    }

    const work = await readAnyWork(kind, id);
    if (!work) return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
    /*
      **그림도 함께 준다.** 회원용 기록의 `url` 은 소유자만 지나는 라우트를
      가리켜 관리자가 열면 빈다 — 서명 주소로 바꿔서 싣는다.

      카드뉴스는 카드 주소가 흐름 JSON 안에 있어 모양이 다르다. 여기서는
      포스터만 싣고, 카드뉴스는 별건으로 남긴다.
    */
    const images = kind === "poster" ? await readAnyWorkImages(id) : [];
    return Response.json({ ok: true, work, images });
  } catch (error) {
    /*
      **DB 오류 문구를 화면에 흘리지 않는다.** 제약 이름·칼럼명이 그대로
      나간다(`security.md`). 서버 로그에 남기고 화면에는 고정 문구를 준다.
    */
    console.error("[admin-works]", error);
    return Response.json({ ok: false, message: "불러오지 못했습니다." }, { status: 500 });
  }
}
