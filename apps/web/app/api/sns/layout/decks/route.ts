import { LayoutDeckSchema, validateDeck } from "@fixup/layout-core";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { listDecks, saveDeck } from "../../../../../lib/layout/deck-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, decks: await listDecks(auth.member.userId) });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "세트를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

/**
 * 세트를 저장한다.
 *
 * 틀을 **복사해서** 담는다. 뼈대 id 만 두면 나중에 그 뼈대를 고쳤을 때 지난
 * 세트가 소리 없이 달라진다.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = LayoutDeckSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ ok: false, message: "세트 입력을 확인해 주세요." }, { status: 400 });
  }

  const problems = validateDeck(parsed.data)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  if (problems.length) {
    return Response.json({ ok: false, message: problems.join(" "), issues: problems }, { status: 400 });
  }

  try {
    return Response.json({ ok: true, deck: await saveDeck(auth.member.userId, parsed.data) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "세트를 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
