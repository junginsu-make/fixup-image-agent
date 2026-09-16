import { authenticateApiAdmin } from "../../../../../../../lib/membership/api";
import { copyCharacterToSelf, copyLibraryWorkToSelf, copyWorkToSelf } from "../../../store";

type Context = { params: Promise<{ kind: string; id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 남의 작업을 **내 것으로 복사한다.** 관리자만.
 *
 * **본문을 읽지 않는다.** 소유자는 세션에서만 온다 — 읽으면 언젠가 그 값이
 * 소유자로 쓰이고, 그때 남의 이름으로 작업이 생긴다.
 *
 * 관문은 읽기와 같다(`../route.ts`). **읽을 수 있는 것만 복사할 수 있다.**
 * 그리고 관문이 조회보다 먼저라, 관리자가 아니면 어떤 id 에도 답이 같다.
 *
 * 고치는 대신 복사하는 까닭은 `copyWorkToSelf` 머리말에 적어 두었다 —
 * 회원용 쓰기 경로를 넓히지 않으려는 것이다.
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;

  const { kind, id } = await context.params;
  if (kind !== "sns" && kind !== "poster" && kind !== "character" && kind !== "library") {
    return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
  }

  try {
    /*
      갈래마다 표가 다르다. 캐릭터는 버킷까지 다르고, 상세페이지·리디자인은
      `library_items` 에 함께 있다 — `kind` 가 `library` 하나인 이유다.
    */
    const copied = kind === "character"
      ? await copyCharacterToSelf(id, auth.member.userId)
      : kind === "library"
        ? await copyLibraryWorkToSelf(id, auth.member.userId)
        : await copyWorkToSelf(kind, id, auth.member.userId);
    return Response.json({ ok: true, id: copied.id });
  } catch (error) {
    /*
      **DB 오류 문구를 화면에 흘리지 않는다.** 제약 이름·칼럼명이 그대로
      나간다(`security.md`). 서버 로그에 남기고 화면에는 고정 문구를 준다.
    */
    console.error("[admin-works]", error);
    return Response.json({ ok: false, message: "복사하지 못했습니다." }, { status: 500 });
  }
}
