/**
 * **대화는 한 시간만 산다**(2026-09-23 사용자 결정, 설계 §6.6).
 *
 * > 창을 닫고 1시간까지만 유지하고 지나면 다 리셋 시키세요.
 *
 * ── 왜 브라우저가 아닌가 ───────────────────────────────────
 *
 * `sessionStorage` 는 탭을 닫으면 사라진다 — 「창을 닫고 한 시간」이 안 된다.
 * `localStorage` 는 영원히 남고, 지울 시계를 브라우저가 들면 그 시계를 못
 * 믿는다. 서버에 두면 **한 시간이 정확히 한 시간**이고 다른 기기에서도 같다.
 *
 * ── 왜 표가 아닌가 ─────────────────────────────────────────
 *
 * **한 시간 뒤면 값어치가 없는 값**이다. 표를 만들면 마이그레이션이 들고,
 * 지우는 일을 또 누가 해야 한다. 상세페이지 진행 표시와 같은 판단이다.
 *
 * 서버가 여러 대가 되면 다른 프로세스가 답해 대화가 비어 보인다 — **새
 * 대화로 시작하면 된다. 틀린 대화를 이어 가는 것보다 낫다.**
 *
 * ── 주인은 세션이 정한다 ───────────────────────────────────
 *
 * 대화도 계정 경계 안이다(§4). 꺼낼 때 **주인이 같은지 본다** — 남의 대화를
 * 불러올 길을 안 만든다.
 */

/**
 * **하루.** 2026-09-28 사용자가 한 시간에서 늘렸다.
 *
 * 화면 쪽과 **같은 수여야 한다**(`lib/cs/chat-store.ts` 의 `CHAT_TTL_MS`).
 * 서버가 먼저 잊으면 화면에는 대화가 보이는데 도우미는 앞의 말을 모른 채
 * 답한다 — 사용자에게는 그것이 「갑자기 멍청해졌다」로 보인다.
 */
const 수명 = 24 * 60 * 60 * 1000;

/** 한 대화에 들고 있을 말의 수. 넘으면 앞에서 버린다. */
const 말최대 = 20;

/** 한 번에 들고 있을 대화 수. 넘으면 오래된 것부터 버린다. */
const 대화최대 = 500;

export interface CsTurn {
  role: "user" | "bot";
  text: string;
  /**
   * 그 답의 근거. **도우미 말에만 있다.**
   *
   * 여기 두는 까닭은 하나다 — 문의를 남길 때 **화면이 보낸 근거를 믿지 않기
   * 위해서다.** 화면이 보내게 하면 아무 주소나 「봇이 찾은 근거」로 넣을 수
   * 있고, 그 주소는 관리자 화면에서 눌리는 링크가 된다.
   */
  sources?: Array<{ name: string; href: string }>;
}

interface 기록 {
  memberId: string;
  turns: CsTurn[];
  at: number;
}

const 장부 = new Map<string, 기록>();

/**
 * **번호를 가린다.** 화면이 만들어 보내는 값이라 그대로 열쇠로 쓰면 아무
 * 글자나 들어온다.
 */
export function isCsSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

function 쓸어낸다(now: number) {
  for (const [id, entry] of 장부) {
    if (now - entry.at > 수명) 장부.delete(id);
  }
  while (장부.size > 대화최대) {
    const 첫째 = 장부.keys().next();
    if (첫째.done) break;
    장부.delete(첫째.value);
  }
}

/**
 * 지금까지의 대화. 없거나 한 시간이 지났거나 남의 것이면 **빈 목록**이다.
 *
 * **빈 목록과 「모른다」를 가르지 않는다.** 대화가 없으면 새로 시작하면
 * 되고, 그것이 이 저장소가 할 수 있는 가장 정직한 답이다.
 */
export function readCsTurns(id: unknown, memberId: string): CsTurn[] {
  if (!isCsSessionId(id) || !memberId) return [];

  const entry = 장부.get(id);
  if (!entry) return [];
  if (entry.memberId !== memberId) return [];
  if (Date.now() - entry.at > 수명) {
    장부.delete(id);
    return [];
  }
  return entry.turns;
}

/**
 * 오간 말을 이어 붙인다.
 *
 * **시계는 말할 때마다 다시 선다.** 한 시간은 「마지막으로 말한 뒤 한
 * 시간」이다 — 대화하는 중에 끊기면 안 된다.
 */
export function appendCsTurns(id: unknown, memberId: string, turns: readonly CsTurn[]): void {
  if (!isCsSessionId(id) || !memberId || turns.length === 0) return;

  const now = Date.now();
  쓸어낸다(now);

  /*
    **남의 번호에 끼어들지 못하게 한다.**

    `readCsTurns` 는 남의 것이면 빈 목록을 준다. 그 값을 그대로 이어 붙이면
    **그 자리를 덮어써** 원래 주인의 대화가 사라진다. 번호를 맞히면 남의
    대화를 지우는 길이 된다 — 시험이 잡았다.
  */
  const 이미있는것 = 장부.get(id);
  if (이미있는것 && 이미있는것.memberId !== memberId && now - 이미있는것.at <= 수명) return;

  const 앞의것 = readCsTurns(id, memberId);
  const 이은것 = [...앞의것, ...turns];

  장부.set(id, {
    memberId,
    // 뒤에서부터 남긴다. 최근 말이 맥락에 더 쓸모 있다.
    turns: 이은것.slice(-말최대),
    at: now,
  });
}

/** 사용자가 「대화 지우기」를 눌렀다. */
export function clearCsTurns(id: unknown, memberId: string): void {
  if (!isCsSessionId(id) || !memberId) return;
  const entry = 장부.get(id);
  // 남의 것을 지우지 못하게 한다.
  if (entry && entry.memberId === memberId) 장부.delete(id);
}

/** 시험 전용. 프로세스 하나를 여러 시험이 나눠 쓰므로 사이를 비운다. */
export function resetCsSessionsForTest() {
  장부.clear();
}
