import type { EasyDecision } from "./chat";
import type { EasyMessage } from "./turn";
import { AD_ANSWER_NOTE, AD_CHOICE_IMAGE, AD_CHOICE_SPECS, isAdQuestion } from "./ad-ask";
import { isSayBody, readAsk, readPick, visibleBody, type EasyAskKind } from "./row-marks";
import { isFailureRowBody } from "../../lib/easy/failure-row";
import { ASK_TARGET_NOTE } from "./chat-facts";

/**
 * **물음 사슬**(2026-10-07 2차 설계 D1 · §3-1).
 *
 * 화면은 물음에 답할 때 처음 말을 다시 보내지 않는다. 서버가 대화 줄을 마지막 물음에서 거슬러
 * 가며 (처음 말, 말로 한 답들, 단추로 고른 값 합본, 사진 id)를 모은다 — 1차 광고 물음의
 * 「물음 앞의 말 + 답」을 모든 물음으로 넓힌 것이다. 이미지 길과 카드뉴스 길이 둘 다 쓴다.
 *
 * 물음 줄 자료의 `cont` 는 「이 물음을 부른 사용자 말이 앞 물음의 답이었다」는 뜻이다. 없으면
 * 바로 앞 사용자 말이 처음 말이다 — 물음 뒤에 새 주문을 쳤으면 사슬이 거기서 끊긴다.
 */
type Row = Pick<EasyMessage, "id" | "role" | "body">;

/** 판단 모델이 「이번 말은 앞 물음의 답이다」라고 `note` 에 적는 값(1차 광고 물음의 것 그대로). */
export const ASK_ANSWER_NOTE = AD_ANSWER_NOTE;

export interface EasyPick {
  kind?: "image" | "cardnews";
  ratio?: string;
  look?: string;
  photoRoles?: Array<{ id: string; role: string }>;
  photoSlots?: Array<{ id: string; role: string }>;
  target?: number;
  card?: number;
  /**
   * 사진 고르기가 열린 채 **말로 친 답**(2차 최종 리뷰 8). 고른 쓰임과 함께 오지만 그 말도 답이다 —
   * 지시에 잇는다(`askInstruction` 의 `typed`, 사슬의 `answers`).
   */
  typed?: true;
}

export interface EasyChainAsk {
  id: string;
  /** 광고 물음(본문 완전일치)은 `ad`. */
  kind: EasyAskKind | "ad";
  data: Record<string, unknown>;
  text: string;
}

export interface EasyAskChain {
  /** 지금 답할 수 있는 마지막 물음. */
  ask: EasyChainAsk;
  /** 물음을 부른 처음 말. */
  origin: string;
  /** 그 뒤에 말로 한 답들(단추 글은 뺀다). 오래된 것부터. */
  answers: string[];
  /** 단추로 고른 값 합본. 뒤에 고른 것이 이긴다. */
  picks: EasyPick;
  /** 가장 최근 물음 줄에 적힌 사진 id. */
  photoIds: string[];
}

export type EasyAnswerWay = "button" | "typed" | "none";

function 물음(row: Row | undefined): EasyChainAsk | undefined {
  if (!row) return undefined;
  if (isAdQuestion(row)) return { id: row.id, kind: "ad", data: {}, text: row.body };
  const ask = readAsk(row);
  return ask ? { id: row.id, ...ask } : undefined;
}

function 단추답인가(row: Row | undefined): boolean {
  if (row?.role !== "user") return false;
  return readPick(row) !== undefined || row.body === AD_CHOICE_IMAGE || row.body === AD_CHOICE_SPECS;
}

function 머리말인가(row: Row | undefined): boolean {
  return row?.role === "assistant" && isSayBody(row.body);
}

/**
 * `at` 자리에 놓인 사용자 말이 답한 물음 줄의 자리. 없으면 -1. 보통은 바로 앞 줄이다.
 * 단추로 답했다가 실패한 짝(단추 답 줄 → (머리말 줄) → 실패 줄)이 사이에 있으면 건너뛴다(1차 `물음자리`
 * 일반화). **머리말 줄은 답이 아니다**(2차 최종 리뷰 2) — 일하는 턴은 사용자 줄 → 머리말 줄 → 그림 줄이라,
 * 머리말 뒤에 실패하면 짝 사이에 머리말이 낀다. 말로 한 답은 서버가 답으로 본 것만 `typed` 표시가 붙어(최종 수정 2)
 * 단추 답처럼 건너뛴다. 표시 없는 말(답이 아니었거나 옛 줄)의 실패는 건너뛰지 않는다 — 답이었는지 모른다.
 */
function 물음자리(rows: readonly Row[], at: number): number {
  if (물음(rows[at - 1])) return at - 1;
  const 실패 = rows[at - 1];
  if (!(실패?.role === "assistant" && isFailureRowBody(실패.body))) return -1;
  const 답자리 = 머리말인가(rows[at - 2]) ? at - 3 : at - 2;
  return 단추답인가(rows[답자리]) && 물음(rows[답자리 - 1]) !== undefined ? 답자리 - 1 : -1;
}

/** 지금 보내는 말이 답할 수 있는 마지막 물음 줄의 자리. 없으면 -1. */
export function askAnchor(rows: readonly Row[]): number {
  return 물음자리(rows, rows.length);
}

/**
 * **화면이 단추를 달 물음 줄**(Review Focus 1, 2차 최종 리뷰 2). 서버가 받아 줄 물음 줄(`askAnchor`)과 같다
 * — 마지막 줄이 물음이거나, 다시 연 대화의 [물음, 단추 답, (머리말), 실패] 면 그 물음. 그 자리에서 단추 답이
 * 실패하면 화면에는 실패 줄이 아직 없어 [물음, 단추 답] 으로 끝나 있다 — 서버에는 실패 줄이 남았으니 그
 * 물음도 받아 준다. 그래서 그 경우도 그 물음 줄이다.
 */
export function answerableAskId(rows: readonly Row[]): string | undefined {
  const at = askAnchor(rows);
  if (at >= 0) return rows[at]!.id;
  const n = rows.length;
  return 단추답인가(rows[n - 1]) && 물음(rows[n - 2]) ? rows[n - 2]!.id : undefined;
}

function 아이디들(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string" && one.length > 0) : [];
}

function 쌍목록(value: unknown): Array<{ id: string; role: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 20).flatMap((one) => {
    const entry = one as { id?: unknown; role?: unknown } | null;
    return entry && typeof entry.id === "string" && typeof entry.role === "string" ? [{ id: entry.id, role: entry.role }] : [];
  });
}

function 번호(value: unknown, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max ? value : undefined;
}

function 짧은글(value: unknown, max = 40): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;
}

function 갈래(value: unknown): "image" | "cardnews" | undefined {
  return value === "image" ? "image" : value === "cardnews" ? "cardnews" : undefined;
}

/** 단추 값 읽기. 화면이 보낸 것이든 줄에 적힌 것이든 모양만 거른다 — 뜻은 쓰는 곳이 다시 본다. */
export function readEasyPick(raw: unknown): EasyPick {
  const value = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const kind = 갈래(value.kind);
  const ratio = 짧은글(value.ratio);
  const look = 짧은글(value.look);
  const photoRoles = 쌍목록(value.photoRoles);
  const photoSlots = 쌍목록(value.photoSlots);
  const target = 번호(value.target, 999);
  const card = 번호(value.card, 99);
  return {
    ...(kind ? { kind } : {}),
    ...(ratio ? { ratio } : {}),
    ...(look ? { look } : {}),
    ...(photoRoles ? { photoRoles } : {}),
    ...(photoSlots ? { photoSlots } : {}),
    ...(target ? { target } : {}),
    ...(card ? { card } : {}),
    ...(value.typed === true ? { typed: true as const } : {}),
  };
}

/** 번호를 고르는 물음(어느 이미지 · 몇 번 장). */
const 번호물음 = new Set<string>(["target", "card"]);

/** 「첫 번째」 · 「셋째」 같은 서수 말(최종 수정 6). 「거울」의 「거」는 안 먹는다 — 「거」 뒤는 띄움 · 토씨 · 끝뿐이다. */
const 서수말 = /(?:(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번\s*째|(?:첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)째)(?:\s*(?:이미지|그림|카드|장|(?:거|것)(?=[\s.,!?~요로를은는이가의에을으예]|$)))?/;
/** 번호 말 뒤의 「거 · 것」(「2번 거예요」 · 「첫 번째 것을」). 「거울」은 안 먹는다. */
const 붙은거 = /^(?:거|것)(?=[\s.,!?~요로를은는이가의에을으예]|$)/;
/** 가리키기만 하는 말의 머리(「그거요」 · 「아무거나」 · 「네」). 뒤가 토씨 · 꼬리뿐이면 고칠 내용이 없다. */
const 가리킴 = /^(?:(?:그|이|저|마지막|방금)\s*(?:거|것|걸)|아무\s*거나|네|응|예)/;
/** 숫자 번호 말: 「#2」 · 「이미지 2(번)」 · 「2번(째)( 장)」 · 맨 앞의 숫자. */
const 숫자말 = /#\s*\d+|(?:이미지|그림|카드|결과물)\s*\d+(?:\s*(?:번째|번|장))?|\d+\s*(?:번째|번|장)(?:\s*(?:장|이미지|그림|카드))?|^\s*\d+(?=[\s.,!?요이에으로]|$)/;
/** 번호 말(숫자 · 서수). 처음 하나만 본다. */
const 번호말 = new RegExp(`${숫자말.source}|${서수말.source}`);
/** 전각 숫자(「２」)를 반각으로. 한 글자씩 바꿔 자리가 안 밀린다. */
const 반각숫자 = (text: string) => text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
/** 번호 말 바로 뒤에 붙는 토씨. */
const 붙은토씨 = /^(?:이요|으로요|로요|으로|로|에서|이에요|예요|입니다|요|을|를|이|가|은|는|의)(?=[\s.,!?~]|$)/;
/** 번호만 고른 말의 꼬리. 이것뿐이면 고칠 내용이 없다. */
const 꼬리 = /^(?:해\s*주세요|해\s*줘|해요|고쳐\s*주세요|고쳐\s*줘|부탁(?:해요|드려요|합니다)|좋아요|좋습니다|할게요|요)?[\s.,!?~]*$/;

/**
 * **번호 물음 · 장 물음의 말 답에서 지시에 이을 말**(Task 8 고침 1 · 3). 그 답은 번호를 고르는 말이다.
 * 가리키기만 하면(「그거요」) 잇지 않는다 — 다시 물은 뒤의 지시에 섞인다. 번호 없이 새 고칠 내용을 말하면
 * (「아니 로고를 바꿔줘」, 최종 재검토) 그대로 잇는다 — 버리면 단추로 고를 때 옛 지시로 값이 나간다. 번호만이면
 * (「1번이요」) 잇지 않고, 번호와 고칠 내용을 함께 말하면(「이미지 1 글자도 크게」) 번호 말을 뺀 나머지를 잇는다.
 * 다른 물음의 답은 그대로 잇는다.
 */
function 답으로잇는말(kind: string, typed: string): string[] {
  if (!번호물음.has(kind)) return [typed];
  const text = 반각숫자(typed);
  const found = 번호말.exec(text);
  if (!found) {
    const 남은 = text.trim().replace(가리킴, "").trimStart().replace(붙은토씨, "").trim();
    return 꼬리.test(남은) ? [] : [typed];
  }
  const 뒤 = text.slice(found.index + found[0].length).trimStart().replace(붙은거, "").replace(붙은토씨, "");
  const 나머지 = `${text.slice(0, found.index).trim()} ${뒤.trim()}`.trim();
  return 꼬리.test(나머지) ? [] : [나머지];
}

/** 고른 값만(말로 친 답 표시 `typed` 는 그 줄의 것이라 사슬의 고른 값에 안 남긴다). */
function 고른값만(pick: EasyPick): EasyPick {
  return Object.fromEntries(Object.entries(pick).filter(([key]) => key !== "typed")) as EasyPick;
}

/** `i` 자리의 물음에서 거슬러 간다. 사슬은 몇 줄 안 되어 되부르기가 얕다. */
function 거슬러간다(rows: readonly Row[], i: number): Omit<EasyAskChain, "ask"> {
  const 지금 = 물음(rows[i])!;
  const 말 = rows[i - 1];
  const ids = 아이디들(지금.data.ids);
  const 앞 = 지금.data.cont === true && 말?.role === "user" ? 물음자리(rows, i - 1) : -1;
  if (앞 < 0) return { origin: 말?.role === "user" ? visibleBody(말) : "", answers: [], picks: {}, photoIds: ids };
  const 앞쪽 = 거슬러간다(rows, 앞);
  const 단추 = 단추답인가(말);
  const 고른 = 단추 ? readEasyPick(readPick(말!)) : {};
  // 말로 친 사진 답(typed)은 고른 값과 함께 그 말도 답으로 잇는다(2차 최종 리뷰 8).
  const 말답 = !단추 || 고른.typed === true;
  return {
    origin: 앞쪽.origin,
    // 번호 물음 · 장 물음의 말 답은 번호 말을 뺀 나머지만 잇는다(Task 8 고침 1 · 3).
    answers: 말답 ? [...앞쪽.answers, ...답으로잇는말(물음(rows[앞])!.kind, visibleBody(말!))] : 앞쪽.answers,
    picks: 단추 ? { ...앞쪽.picks, ...고른값만(고른) } : 앞쪽.picks,
    photoIds: ids.length ? ids : 앞쪽.photoIds,
  };
}

export function askChain(rows: readonly Row[]): EasyAskChain | undefined {
  const at = askAnchor(rows);
  const ask = 물음(rows[at]);
  return ask ? { ask, ...거슬러간다(rows, at) } : undefined;
}

/**
 * 만들 때 쓰는 지시 = 처음 말 + 줄바꿈 + 말 답들(설계 §3-1). **답일 때만 잇는다** — 단추 답이면
 * 처음 말 + 앞의 말 답, 말로 한 답이면 이번 말까지. 답이 아니면 이번 말 그대로다.
 *
 * 번호만 고르는 물음(어느 이미지 · 몇 번 장)의 말 답은 번호 말을 뺀 나머지만 넣는다 — 「2번」 · 「그거요」는
 * 고칠 내용이 아니고, 「이미지 1 글자도 크게」의 「글자도 크게」는 고칠 내용이다(`답으로잇는말`).
 * 옛 화면이 처음 말을 다시 보내도(배포 사이) 두 번 붙지 않게 처음 말과 같은 답은 뺀다.
 */
export function askInstruction(chain: EasyAskChain | undefined, prompt: string, way: EasyAnswerWay): string {
  if (!chain || way === "none" || !chain.origin) return prompt;
  const 이번답 = way === "typed" ? 답으로잇는말(chain.ask.kind, prompt) : [];
  const 답들 = [...chain.answers, ...이번답].filter((one) => one.trim() && one !== chain.origin);
  return [chain.origin, ...답들].join("\n");
}

export interface EasyButtonAnswer {
  chain: EasyAskChain;
  pick: EasyPick;
}

/**
 * **단추 답은 지금 마지막 물음 줄의 것만 받는다**(설계 §3-1, Review Focus 1). 지난 물음의 단추로
 * 지금 맥락과 다른 지시에 값이 나가지 않게. 광고 물음 단추는 1차 그대로 단추 글로 온다.
 */
export function readButtonAnswer(input: { answersRowId?: unknown; pick?: unknown }, rows: readonly Row[]): EasyButtonAnswer | undefined {
  if (typeof input.answersRowId !== "string" || !input.answersRowId) return undefined;
  const chain = askChain(rows);
  if (!chain || chain.ask.kind === "ad" || chain.ask.id !== input.answersRowId) return undefined;
  return { chain, pick: readEasyPick(input.pick) };
}

function 말한값(data: Record<string, unknown>): Pick<EasyDecision, "ratio" | "look"> {
  const ratio = 짧은글(data.ratio);
  const look = 짧은글(data.look);
  return { ...(ratio ? { ratio } : {}), ...(look ? { look } : {}) };
}

/**
 * **단추 답의 판단**(설계 §3-1) — 물음 줄 자료의 판단 + 고른 값으로 바로 간다. 글 모델을 안 부른다.
 * 고른 값이 모자라면 `undefined` — 그때는 말로 본다(판단 모델이 가른다).
 */
export function buttonDecision(answer: EasyButtonAnswer): EasyDecision | undefined {
  const { ask } = answer.chain;
  const { pick } = answer;
  const said = 말한값(ask.data);
  if (ask.kind === "kind") return pick.kind ? { wants: pick.kind, reply: "", ...said } : undefined;
  if (ask.kind === "ratio") return { wants: "image", reply: "", ...said };
  if (ask.kind === "photo") return { wants: ask.data.wants === "cardnews" ? "cardnews" : "image", reply: "", ...said };
  if (ask.kind === "reference") return { wants: "cardnews", reply: "", ...said };
  if (ask.kind === "target") return pick.target ? { wants: "image_edit", reply: "", target: pick.target } : undefined;
  const 장갈래 = ask.data.wants === "card_text" ? "card_text" : ask.data.wants === "card_redo" ? "card_redo" : undefined;
  if (ask.kind === "card" && pick.card && 장갈래) {
    const note = 짧은글(ask.data.note, 500);
    return { wants: 장갈래, reply: "", card: pick.card, ...(note ? { note } : {}) };
  }
  return undefined;
}

export interface EasyChosen {
  kind?: "image" | "cardnews";
  /** 갈래를 단추로 골랐나(1차 A2). 그러면 판단과 상관없이 그 갈래로 간다. */
  kindPicked: boolean;
  ratio?: string;
  look?: string;
  photoRoles?: unknown;
  photoSlots?: unknown;
}

/**
 * **이번 턴에 쓸 고른 값.** 사슬(답일 때만 라우트가 넘긴다)의 단추 값 + 이번 단추 값. 없으면 옛
 * 화면이 보낸 칸(`kind` · `kindPicked` · `ratio` · `look` · `photoRoles` · `photoSlots`)을 쓴다.
 *
 * `kindPicked`: 이번 턴이 단추 답이고 사슬에 고른 갈래가 있을 때만(1차 「갈래 단추로 보낸 턴과 그 뒤
 * **단추로** 이어 답한 턴」). 말로 한 답은 갈래를 잇지만 고른 것이 아니다.
 */
export function chosenFor(input: Record<string, unknown>, chain: EasyAskChain | undefined, button: EasyPick | undefined): EasyChosen {
  const picks: EasyPick = { ...(chain?.picks ?? {}), ...(button ?? {}) };
  const kind = picks.kind ?? 갈래(input.kind);
  const ratio = picks.ratio ?? 짧은글(input.ratio);
  const look = picks.look ?? 짧은글(input.look);
  const photoRoles = picks.photoRoles ?? input.photoRoles;
  const photoSlots = picks.photoSlots ?? input.photoSlots;
  return {
    ...(kind ? { kind } : {}),
    kindPicked: (button !== undefined && picks.kind !== undefined) || input.kindPicked === true,
    ...(ratio ? { ratio } : {}),
    ...(look ? { look } : {}),
    ...(photoRoles !== undefined ? { photoRoles } : {}),
    ...(photoSlots !== undefined ? { photoSlots } : {}),
  };
}

export interface EasyTypedAnswer {
  decision: EasyDecision;
  /** 이번 말을 그 물음의 답으로 본다 — 처음 말 · 고른 값 · 물음 줄의 사진을 잇는다. */
  answered: boolean;
  /** 모양을 물어도 되나. 모양 물음 바로 뒤면 `false` — 같은 물음을 또 하지 않는다. */
  askRatio: boolean;
}

/**
 * **말로 한 답의 갈래 정리**(2차 최종 리뷰 6 · Review Focus 8). 판단 모델의 답을 바로 앞 물음의 갈래로
 * 한 번 더 본다 — 같은 물음이 되풀이되거나 처음 말을 잃지 않게. 단추 답에는 안 건다(물음 줄의 판단이다).
 *
 * - 모양 물음 뒤: 답이든 아니든 **모양을 다시 묻지 않는다**(말한 비율이 없으면 정사각형). 물은 것에 말로
 *   답했는데 같은 물음이 또 뜨면 대화가 거기서 맴돈다
 * - 갈래 물음 뒤 또 `either`: 한 장으로 가고 답으로 본다(「아무거나」). 그 reply 는 갈래 물음 글이라 버린다
 * - 번호 물음 바로 뒤 `image_edit` · 장 물음 바로 뒤 장 갈래: 물음이 바란 갈래라 `note` 가 없어도 답이다.
 *   장 물음이면 바라는 점은 이번 `note`, 없거나 `answer` 면 물을 때 적어 둔 것
 * - 번호 물음 바로 뒤 talk + `ask_target`(번호 없는 답이라 다시 묻기): 답이다(최종 수정 1). 아니면 새 물음 줄에 `cont` 가
 *   없어 처음 말이 「그거요」가 되고, 단추로 고르면 그 말로 고친다. 번호 없는 말은 지시에 안 잇는다(`답으로잇는말`)
 * - 그 밖(사진 · 레퍼런스 · 광고): 판단 모델이 `note` 에 answer 라고 적었을 때만 답이다
 */
export function settleTypedAnswer(ask: EasyChainAsk | undefined, decision: EasyDecision): EasyTypedAnswer {
  const 답표시 = decision.note === ASK_ANSWER_NOTE;
  if (!ask) return { decision, answered: false, askRatio: true };
  if (ask.kind === "ratio") return { decision, answered: 답표시, askRatio: false };
  if (ask.kind === "kind" && decision.wants === "either") {
    return { decision: { ...decision, wants: "image", reply: "", note: ASK_ANSWER_NOTE }, answered: true, askRatio: true };
  }
  if (ask.kind === "target" && decision.wants === "image_edit") return { decision, answered: true, askRatio: true };
  if (ask.kind === "target" && decision.wants === "talk" && decision.note === ASK_TARGET_NOTE) {
    return { decision, answered: true, askRatio: true };
  }
  if (ask.kind === "card" && (decision.wants === "card_text" || decision.wants === "card_redo")) {
    const 바라는점 = decision.note && !답표시 ? decision.note : 짧은글(ask.data.note, 500);
    return {
      decision: {
        wants: decision.wants, reply: decision.reply,
        ...(decision.card ? { card: decision.card } : {}),
        ...(바라는점 ? { note: 바라는점 } : {}),
      },
      answered: true,
      askRatio: true,
    };
  }
  return { decision, answered: 답표시, askRatio: true };
}
