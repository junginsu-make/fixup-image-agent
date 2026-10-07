import { AD_CHOICE_IMAGE, AD_CHOICE_SPECS } from "./ad-ask";
import { askChain, askInstruction, readEasyPick } from "./ask-chain";
import { editRequestOf, rowFromOf } from "./row-image";
import { readPick, visibleBody } from "./row-marks";
import type { EasyMessage } from "./turn";

/**
 * **이 대화의 결과물 번호**(2026-10-07 2차 설계 D2 · §3-2, 2차 최종 리뷰 5 — 컨트롤러 결정).
 *
 * 화면(「이미지 N」 · 「카드뉴스 N」)과 서버(판단 모델에 주는 목록 · 고칠 번호 검증)가 **같은 함수**를 쓴다.
 * 결과물 줄 — 포스터 그림 줄 · 카드뉴스 줄 · 작업을 지운 줄 **모두**(`role: "image"` + `workId`) — 에 대화
 * 차례대로 1, 2, … 를 붙인다. 고친 줄도 제 번호를 받는다(다른 그림이다).
 *
 * **표시도 작업 조회도 안 본다.** 그래서 2차 전에 남은 운영의 옛 줄(표시 없는 빈 글)도 데이터 SQL 없이 같은
 * 번호를 받고, 무엇을 지워도 뒤 번호가 당겨지지 않는다 — 「아까 1번」이 늘 같은 것을 가리킨다. 그 번호가
 * 무엇인지(이미지 · 카드뉴스 · 지운 것)는 따로 가른다(`resultKindOf`). 고치기는 이미지 번호일 때만이다.
 */
type Row = { id: string; role: string; workId?: string | null; body?: string | null };

export interface EasyResultNumber {
  n: number;
  rowId: string;
  workId: string;
  /** 고친 줄이면 고친 대상 줄. */
  fromRowId?: string;
}

/** `unknown`: 저장소를 못 읽어 무엇인지 모른다(리뷰 1차 수정 2). 지운 것으로 말하지 않는다. */
export type EasyResultKind = "image" | "cardnews" | "deleted" | "unknown";

/** 이미지의 상태. 카드뉴스는 `done`, 지운 것은 `deleted`, 모르는 것은 `unknown` 으로 둔다. */
export type EasyImageState = "done" | "making" | "failed" | "deleted" | "unknown";

export interface EasyResultEntry extends EasyResultNumber {
  kind: EasyResultKind;
  state: EasyImageState;
  /** 그 결과물을 만든 사용자 말 앞부분. */
  words: string;
  /** 고친 대상의 번호. */
  fromN?: number;
}

export function numberEasyResults(rows: readonly Row[]): EasyResultNumber[] {
  const 결과줄 = rows.filter((row): row is Row & { workId: string } => row.role === "image" && Boolean(row.workId));
  return 결과줄.map((row, index) => {
    // 고친 줄이면 고친 대상. `;from=` 이 없는 옛 고친 줄은 같은 작업의 첫 줄을 고친 것으로 본다.
    const from = rowFromOf(row.body)
      ?? (editRequestOf(row.body) ? 결과줄.find((one) => one.workId === row.workId)?.id : undefined);
    return { n: index + 1, rowId: row.id, workId: row.workId, ...(from && from !== row.id ? { fromRowId: from } : {}) };
  });
}

/** 다음에 남길 결과물 줄의 번호. */
export function nextResultNumber(rows: readonly Row[]): number {
  return numberEasyResults(rows).length + 1;
}

/**
 * 그 번호가 무엇인가. 포스터 저장소에 있으면 이미지, 카드뉴스 저장소에 있으면 카드뉴스, 둘 다 없으면 지운 것.
 * **못 읽은 작업(`unread`)은 지운 것이 아니라 모르는 것**이다(리뷰 1차 수정 2) — 잠깐 끊긴 것을 「지운 결과」로
 * 말하면 사용자에게 거짓을 말한다.
 */
export function resultKindOf(
  workId: string,
  posters: ReadonlySet<string>,
  cardnews: ReadonlySet<string>,
  unread: ReadonlySet<string> = new Set(),
): EasyResultKind {
  if (posters.has(workId)) return "image";
  if (cardnews.has(workId)) return "cardnews";
  return unread.has(workId) ? "unknown" : "deleted";
}

/** 화면 이름표. 지운 것 · 모르는 것은 무엇이었는지 모를 수 있어(표시 없는 옛 줄) 「결과물 N」이다. */
export function resultLabel(kind: EasyResultKind, n: number): string {
  return kind === "image" ? `이미지 ${n}` : kind === "cardnews" ? `카드뉴스 ${n}` : `결과물 ${n}`;
}

const 앞말길이 = 40;

type ChainRow = Pick<EasyMessage, "id" | "role" | "body">;

function 단추답인가(row: ChainRow): boolean {
  const pick = readPick(row);
  if (pick !== undefined) return readEasyPick(pick).typed !== true;
  return row.body === AD_CHOICE_IMAGE || row.body === AD_CHOICE_SPECS;
}

/**
 * 결과물을 만든 말(리뷰 1차 수정 1). 결과물 앞의 마지막 사용자 말이 물음의 답이면 **처음 주문**을 쓴다 — 라우트가
 * 지시를 만드는 것과 같은 사슬(`askChain` · `askInstruction`)이다. 단추 답 글(「세로」)은 주문이 아니라 빼고,
 * 말로 한 답은 처음 말 뒤에 잇는다(번호만 고른 말 답은 안 잇는다). 줄바꿈은 목록 한 줄에 맞게 「 / 」로 바꾼다.
 */
function 만든말(rows: readonly ChainRow[], at: number): string {
  let u = at - 1;
  while (u >= 0 && rows[u]!.role !== "user") u -= 1;
  if (u < 0) return "";
  const 말 = rows[u]!;
  const 이번 = visibleBody(말);
  const chain = askChain(rows.slice(0, u));
  const 주문 = chain ? askInstruction(chain, 이번, 단추답인가(말) ? "button" : "typed") : 이번;
  return 주문.split("\n").map((one) => one.trim()).filter(Boolean).join(" / ");
}

/** 번호마다 갈래 · 상태 · 만든 말 · 고친 번호. 갈래 · 상태는 부르는 쪽(서버)이 안다. */
export function describeEasyResults(
  rows: readonly Row[],
  numbered: readonly EasyResultNumber[],
  factOf: (entry: EasyResultNumber) => { kind: EasyResultKind; state: EasyImageState },
): EasyResultEntry[] {
  const 번호 = new Map(numbered.map((one) => [one.rowId, one.n]));
  const 줄들: ChainRow[] = rows.map((row) => ({ id: row.id, role: row.role as EasyMessage["role"], body: row.body ?? "" }));
  return numbered.map((one) => {
    const at = rows.findIndex((row) => row.id === one.rowId);
    const fromN = one.fromRowId ? 번호.get(one.fromRowId) : undefined;
    return {
      ...one,
      ...factOf(one),
      words: 만든말(줄들, Math.max(at, 0)).slice(0, 앞말길이),
      ...(fromN ? { fromN } : {}),
    };
  });
}

/** 고칠 수 있는(다 만든) 이미지 번호. 카드뉴스 · 지운 것 · 만드는 중은 뺀다. */
export function doneImageNumbers(entries: readonly EasyResultEntry[]): number[] {
  return entries.filter((one) => one.kind === "image" && one.state === "done").map((one) => one.n);
}
