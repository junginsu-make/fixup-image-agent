import { authenticateApiMember } from "../../../../lib/membership/api";
import { easyStoreForUser } from "../../../../lib/easy/store";
import { easyTitle } from "../../../easy/title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Easy 모드 대화 목록·만들기 (설계 §4-1).
 *
 * **새 생성 경로가 아니다.** 여기는 대화를 담는 자리다 — 그림을 만드는 것은
 * `api/easy/generate` 가 기존 포스터 경로를 불러서 한다(설계 §8).
 */

function fail(error: unknown, fallback: string) {
  return Response.json(
    { ok: false, message: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

/** 레일에 걸 목록. */
export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const store = easyStoreForUser(auth.member.userId);
    return Response.json({ ok: true, conversations: await store.listConversations() });
  } catch (error) {
    return fail(error, "대화 목록을 읽지 못했습니다.");
  }
}

/**
 * 새 대화.
 *
 * **제목은 첫 프롬프트로 짓는다**(설계 §4-1). 만들 때는 비어 있고, 첫 말이
 * 들어올 때 `generate` 가 채운다 — LLM 을 한 번 더 부르지 않는다.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const store = easyStoreForUser(auth.member.userId);
    // 화면이 제목을 보내면 그것도 같은 규칙으로 자른다. 레일 한 줄이 무너지지
    // 않게 하는 것은 화면이 아니라 이 규칙의 일이다.
    const conversation = await store.createConversation(
      easyTitle(typeof body.title === "string" ? body.title : ""),
    );
    return Response.json({ ok: true, conversation }, { status: 201 });
  } catch (error) {
    return fail(error, "대화를 만들지 못했습니다.");
  }
}
