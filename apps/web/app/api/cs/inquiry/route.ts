import { z } from "zod";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { saveInquiry } from "../../../../lib/cs/inquiry";
import { readCsTurns, type CsTurn } from "../../../../lib/cs/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **담당자에게 문의를 남긴다**(2026-09-23 사용자 결정, 설계 §10).
 *
 * ── 왜 사용량을 안 잡나 ────────────────────────────────────
 *
 * 모델을 안 부른다. 표에 한 줄 넣고 메일 한 통 보낸다. 여기에 예약을 걸면
 * **답을 못 받아 문의하러 온 사람이 한도에 막힌다** — 가장 나쁜 자리다.
 *
 * ── 화면이 보낸 것을 믿지 않는다 ───────────────────────────
 *
 * 받는 것은 **물음과 대화 번호뿐이다.** 대화도 근거도 서버가 들고 있는 것을
 * 쓴다(`readCsTurns`).
 *
 * 대화를 통째로 받으면 아무 글이나 「내 대화」로 넣을 수 있다. 근거는 더
 * 나쁘다 — 그 주소가 **관리자 화면에서 눌리는 링크**가 되므로, 화면이 주소를
 * 정하게 하면 회원이 관리자에게 링크를 먹일 수 있다.
 */

const 문의 = z.object({
  question: z.string().trim().min(1).max(2000),
  sessionId: z.string().max(64).optional(),
  page: z.string().max(200).optional(),
}).strict();

/**
 * **물은 그 물음에 대한 답의 근거.**
 *
 * ── 왜 마지막 답이 아닌가 ──────────────────────────────────
 *
 * 화면은 답마다 「문의 남기기」를 붙인다. 못 받은 답이 셋째 줄인데 그 뒤로
 * 두 번 더 물었다면, **마지막 답의 근거를 달면 엉뚱한 문서가 붙는다** — 그것도
 * 하필 「근거를 찾았다」 쪽으로 붙어서, 설계 §10.1 이 이 칸을 둔 까닭인 「지식
 * 구멍이 여기서 드러난다」가 거짓이 된다(2026-09-28 독립 검토가 실증).
 *
 * 그래서 **같은 물음을 대화에서 찾고 그 바로 뒤의 답**을 쓴다. 같은 말을 두 번
 * 물었으면 나중 것이다. 못 찾으면 마지막 답으로 돌아간다 — 대화가 지워졌거나
 * 화면이 대화에 없는 말을 보낸 경우다.
 */
function 그물음의근거(turns: readonly CsTurn[], question: string): Array<{ name: string; href: string }> {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]!.role !== "user" || turns[i]!.text !== question) continue;
    const 답 = turns.slice(i + 1).find((turn) => turn.role === "bot");
    return 답?.sources ?? [];
  }
  // 대화에 없는 물음이다. 마지막 답의 근거로 돌아간다.
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]!.role === "bot") return turns[i]!.sources ?? [];
  }
  return [];
}

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  let 입력;
  try {
    입력 = 문의.parse(await req.json());
  } catch {
    return Response.json({ ok: false, message: "문의 내용을 읽지 못했습니다." }, { status: 400 });
  }

  // **서버가 들고 있는 대화를 쓴다.** 그것도 세션 주인 것만 나온다.
  const turns = readCsTurns(입력.sessionId, auth.member.userId);

  const result = await saveInquiry({
    userId: auth.member.userId,
    email: auth.member.profile.email,
    question: 입력.question,
    turns,
    sources: 그물음의근거(turns, 입력.question),
    page: 입력.page,
  });

  return Response.json(result, { status: result.ok ? 200 : 500 });
}
