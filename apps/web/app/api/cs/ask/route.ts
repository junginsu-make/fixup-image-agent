import { z } from "zod";
import { retrieveKnowledge } from "@fixup/redesign-core";
import { reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../lib/membership/credit-ledger";
import { readLlmMeter, withLlmMeter } from "../../../../lib/llm/meter";
import { describeAccount } from "../../../../lib/cs/account-facts";
import { readMyFacts } from "../../../../lib/cs/my-account";
import { appendCsTurns, readCsTurns } from "../../../../lib/cs/session";
import { formatReply } from "../../../../lib/cs/reply-format";
import { createCsProvider } from "../../../../lib/cs/provider";
import { ANSWER_SPEC, DECIDE_SPEC, answerPrompt, decidePrompt } from "../../../../lib/cs/prompt";
import {
  HANDOFF, NO_EVIDENCE, evidenceBlock, hasUsableEvidence, planFrom, showsSources, sourcesFrom,
} from "../../../../lib/cs/answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * **CS 도우미에게 한 번 묻는다**(2026-09-23 사용자 요청).
 *
 * ── 계정 경계 (설계 §4) ────────────────────────────────────
 *
 * > 다른 계정에 대한 답은 절대 하면 안되기도 하고요. AI bot은 사용자와
 * > 시스템 간에만 이뤄져야 합니다.
 *
 * **요청 모양에 계정을 가리키는 칸이 없다.** `userId`·`email` 이 아예
 * 없으므로 남의 것을 읽어 달라고 **말할 자리 자체가 없다.** 누구인지는
 * `reserveAiUsage` 가 세션에서 정해 준다.
 *
 * 모델이 고르는 것은 「무엇을 알고 싶은가」뿐이고, 읽기 함수는 그 `userId`
 * 로만 읽는다. **프롬프트가 뚫려도 아무 일이 안 일어난다.**
 *
 * ── 회원만 (설계 §6.5) ─────────────────────────────────────
 *
 * 비회원에게는 안 연다. `reserveAiUsage` 가 문지기를 겸한다.
 *
 * ── 근거가 없으면 모델을 안 부른다 (설계 §6.3) ─────────────
 *
 * 물어 놓고 「모른다고 답해라」라고 부탁하는 것보다 **안 부르는 편이
 * 확실하고 값도 안 든다.**
 *
 * ── 값은 장부에 싣는다 (설계 §6.4) ─────────────────────────
 *
 * 크레딧은 0 장이지만 글 모델과 임베딩 값은 나간다. 이 저장소는 「값이
 * 나가는데 장부에 0 원」인 자리를 세 번 고쳤다 — 이번에는 처음부터 싣는다.
 */

const 물음 = z.object({
  question: z.string().trim().min(1).max(2000),
  /** 대화를 잇는 번호. 화면이 만들어 보낸다. 계정과 무관하다. */
  sessionId: z.string().max(64).optional(),
  /** 어느 화면에서 물었나. 문의로 넘길 때 함께 남는다. */
  page: z.string().max(200).optional(),
}).strict();

/** 설명서에서 몇 조각까지 볼까. 많이 주면 답이 흐려지고 값만 는다. */
const 조각수 = 6;

export async function POST(req: Request) {
  return withLlmMeter(() => ask(req));
}

async function ask(req: Request) {
  /*
    **여기가 문이자 신원 확인이다.** 로그인·정지·탈퇴를 한 번에 거르고,
    누구인지(`userId`)를 정해 준다. 크레딧은 0 장이다.
  */
  const reservation = await reserveAiUsage(req, "cs_ask", 0, freeCreditPlan("cs:ask"));
  if (!reservation.ok) return reservation.response;

  const 닫는다 = (success: boolean, errorCode?: string) =>
    settleAiUsage(reservation, success, 0, errorCode, {
      model: "", billableImages: 0, llmUsd: readLlmMeter().usd,
    });

  let 입력;
  try {
    입력 = 물음.parse(await req.json());
  } catch {
    await 닫는다(false, "invalid_request");
    return Response.json({ ok: false, message: "물음을 읽지 못했습니다." }, { status: 400 });
  }

  const userId = reservation.userId;
  const turns = readCsTurns(입력.sessionId, userId);

  try {
    // ① 무엇을 묻는가.
    const decision = await createCsProvider(DECIDE_SPEC).generate(decidePrompt(입력.question, turns));
    const plan = planFrom(decision, 입력.question);

    if (plan.act === "handoff") {
      return 마무리(입력, userId, turns, { reply: HANDOFF, sources: [], handoff: true }, 닫는다);
    }

    // ② 무엇을 근거로 답하나.
    const chunks = plan.act === "search"
      ? await retrieveKnowledge(plan.query, 조각수, { kind: "guide" })
      : [];

    /*
      **근거가 없으면 모델을 안 부른다.** 설명서에 없는 것을 물으면 모델은
      있는 것처럼 답한다. 「결제가 안 돼요」에 잘못 답하면 돈 문제가 된다.
    */
    if (plan.act === "search" && !hasUsableEvidence(chunks)) {
      return 마무리(입력, userId, turns, { reply: NO_EVIDENCE, sources: [], handoff: true }, 닫는다);
    }

    // **내 것만 읽는다.** `userId` 는 세션에서 왔다.
    const facts = plan.act === "account"
      ? describeAccount(plan.topics, await readMyFacts(userId, plan.topics))
      : [];

    const 답 = (await createCsProvider(ANSWER_SPEC).generate(answerPrompt({
      question: 입력.question, turns, evidence: evidenceBlock(chunks), facts,
    }))) as { answered?: boolean; reply?: string };

    /*
      **「답했는가」를 따로 본다.** 답 글만 받으면 모델이 「모르겠습니다」를
      답처럼 써 보내고, 화면은 그것을 답으로 그린다.
    */
    const 못했다 = 답?.answered === false || !String(답?.reply ?? "").trim();
    /*
      **놓기 전에 모양을 다듬는다**(2026-09-28 사용자 신고 「한 줄로만 쭉
      나옵니다」). 낱말은 그대로 두고 줄만 만진다 — 마크다운 별표를 걷고,
      한 덩어리로 온 글은 문장마다 끊는다.
    */
    const reply = 못했다 ? NO_EVIDENCE : formatReply(String(답.reply));

    return 마무리(입력, userId, turns, {
      reply,
      sources: 못했다 || !showsSources(plan) ? [] : sourcesFrom(chunks),
      handoff: 못했다,
    }, 닫는다);
  } catch (error) {
    await 닫는다(false, "cs_failed");
    console.warn("[cs] 도우미 답변 실패", error);
    return Response.json(
      { ok: false, message: "지금은 답을 드리지 못했습니다. 잠시 후 다시 물어봐 주세요." },
      { status: 503 },
    );
  }
}

async function 마무리(
  입력: { question: string; sessionId?: string },
  userId: string,
  turns: readonly { role: "user" | "bot"; text: string }[],
  결과: { reply: string; sources: Array<{ name: string; href: string }>; handoff: boolean },
  닫는다: (success: boolean, errorCode?: string) => Promise<unknown>,
) {
  void turns;
  appendCsTurns(입력.sessionId, userId, [
    { role: "user", text: 입력.question },
    /*
      **근거를 말과 함께 남긴다.** 문의를 남길 때 화면이 보낸 근거를 믿지
      않으려면 서버가 들고 있어야 한다(`app/api/cs/inquiry/route.ts`).
    */
    { role: "bot", text: 결과.reply, sources: 결과.sources },
  ]);
  await 닫는다(true);
  return Response.json({ ok: true, ...결과 }, { headers: { "Cache-Control": "no-store" } });
}
