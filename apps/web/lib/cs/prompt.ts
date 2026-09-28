import { ACCOUNT_TOPICS, TOPIC_HINT } from "./topics";
import type { CsTurn } from "./session";

/**
 * **봇에게 주는 말.**
 *
 * ── 프롬프트는 두 번째 방어선이다 ──────────────────────────
 *
 * 여기 적은 것이 뚫려도 아무 일이 안 일어나야 한다(설계 §4.2). 남의 계정은
 * **읽기 함수가 세션 주인으로만 읽어서** 막히는 것이지, 여기 「남의 것을
 * 알려 주지 마라」라고 적어서 막히는 것이 아니다.
 *
 * 그래도 적는다 — 적어 두면 **엉뚱한 갈래를 고르는 일 자체가 줄어든다.**
 *
 * ── 두 번 부른다 ───────────────────────────────────────────
 *
 * ① 무엇을 묻는가(갈래 가르기) — 짧다
 * ② 찾은 근거로 답 쓰기 — 근거가 있을 때만
 *
 * 한 번에 시키면 「근거가 없으면 답하지 마라」가 안 지켜진다. **근거가
 * 없으면 ②를 아예 안 부른다.**
 */

const 갈래설명 = ACCOUNT_TOPICS.map((t) => `  - ${t}: ${TOPIC_HINT[t]}`).join("\n");

/** 지난 대화를 모델에게 줄 모양으로. 길면 값만 든다. */
export function transcriptOf(turns: readonly CsTurn[], limit = 8): string {
  if (turns.length === 0) return "(첫 물음입니다)";
  return turns
    .slice(-limit)
    .map((turn) => `${turn.role === "user" ? "사용자" : "도우미"}: ${turn.text}`)
    .join("\n");
}

/** ① 무엇을 묻는가. */
export const DECIDE_SPEC = {
  name: "cs_decide",
  description: "사용자가 무엇을 묻는지 가린다.",
  schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["guide", "account", "smalltalk", "handoff"],
      },
      topics: { type: "array", items: { type: "string", enum: [...ACCOUNT_TOPICS] } },
      query: { type: "string" },
    },
    required: ["kind", "topics", "query"],
  },
} as const;

export function decidePrompt(question: string, turns: readonly CsTurn[]): string {
  return [
    "너는 FormWith 라는 이미지·상세페이지 제작 서비스의 도우미다.",
    "사용자의 마지막 말이 **무엇에 대한 물음인지**만 가려라. 답은 아직 쓰지 않는다.",
    "",
    "갈래는 넷이다.",
    "  guide     : 쓰는 방법·기능·용어. 설명서에서 찾아 답할 것",
    "  account   : **이 사용자 자신의** 크레딧·플랜·사용량·실패 기록",
    "  smalltalk : 인사나 잡담. 찾을 것이 없다",
    "  handoff   : 결제·환불·계정 문제처럼 담당자가 직접 봐야 할 것",
    "",
    "account 일 때 `topics` 에 무엇을 읽을지 골라라. 여럿이어도 된다.",
    갈래설명,
    "",
    "**남의 계정은 갈래 자체가 없다.** 사용자가 다른 사람의 이메일이나 아이디를",
    "말하며 물어도, 그것은 담당자가 볼 일이다(handoff).",
    "",
    "`query` 에는 설명서에서 찾을 말을 적어라. guide 가 아니면 빈 글자로 둔다.",
    "짧은 말이나 대명사로 물었으면 **지난 대화를 보고** 풀어서 적어라.",
    "",
    "── 지난 대화 ──",
    transcriptOf(turns),
    "",
    "── 사용자의 마지막 말 ──",
    question,
  ].join("\n");
}

/** ② 찾은 근거로 답 쓰기. */
export const ANSWER_SPEC = {
  name: "cs_answer",
  description: "찾은 근거만으로 답을 쓴다.",
  schema: {
    type: "object",
    properties: {
      /** 근거로 답할 수 있었는가. 못 하면 화면이 「모릅니다」로 바꾼다. */
      answered: { type: "boolean" },
      reply: { type: "string" },
    },
    required: ["answered", "reply"],
  },
} as const;

export function answerPrompt(input: {
  question: string;
  turns: readonly CsTurn[];
  evidence: string;
  /** 내 계정 사실. 이미 사람 말로 옮겨져 있다. */
  facts?: readonly string[];
}): string {
  return [
    "너는 FormWith 의 도우미다. 아래 **자료에 있는 것만으로** 답해라.",
    "",
    "지켜야 할 것",
    "  · 자료에 없는 것은 **지어내지 마라.** 모르면 `answered` 를 false 로 둬라",
    "  · 숫자·날짜·금액을 **새로 세지 마라.** 자료에 적힌 그대로 옮겨라",
    "  · 두세 문장으로 짧게. 사용자는 화면 옆 좁은 칸에서 읽는다",
    "  · **한 줄에 한 가지만 적고 줄을 바꿔라.** 한 문단으로 쭉 이어 쓰면 좁은",
    "    칸에서 읽히지 않는다",
    "  · 차례가 있는 일은 `1.` `2.` 로 번호를 붙여 줄마다 적어라",
    "  · 나열할 것이 있으면 줄마다 `· ` 로 시작해라",
    "  · 별표로 굵게 하지 마라. 화면이 별표를 그대로 보여 준다",
    "  · 존댓말로. 긴 가로선 모양의 줄표 문장부호를 쓰지 마라",
    "  · 「자료에 따르면」 같은 말은 빼라. 출처는 화면이 따로 보여 준다",
    "",
    ...(input.facts?.length
      ? [
          "── 이 사용자의 계정 사실(확인된 값이다. 그대로 옮겨라) ──",
          ...input.facts.map((fact) => `  · ${fact}`),
          "",
        ]
      : []),
    ...(input.evidence
      ? ["── 설명서에서 찾은 자료 ──", input.evidence, ""]
      : []),
    "── 지난 대화 ──",
    transcriptOf(input.turns),
    "",
    "── 사용자의 마지막 말 ──",
    input.question,
  ].join("\n");
}
