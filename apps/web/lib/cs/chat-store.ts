/**
 * **대화를 화면 사이에서 지킨다**(2026-09-28 사용자 요청).
 *
 * > 페이지를 넘기면 자동으로 사이드바가 닫히게 되고 기록이 삭제되는데,
 * > 별도로 데이터베이스에 저장까지 할 필요는 없지만, 페이지를 이동해도
 * > 유지 됐으면 합니다. 웹 브라우저를 아예 종료하거나 로그아웃 하거나,
 * > 24시간이 지나면 초기화 되는 기준이였으면 좋겠습니다.
 *
 * ── 왜 사라졌나 ────────────────────────────────────────────
 *
 * `AppShell` 주석은 「셸은 화면을 옮겨도 다시 만들어지지 않는다」고 적고
 * 있지만, **그것은 한 layout 안에서만 참이다.** 이 저장소는 `/library`,
 * `/create`, `/easy` … 가 **각자 제 layout 에서 셸을 두른다.** 그래서 도구를
 * 옮기면 셸이 통째로 새로 만들어지고 `useState` 가 빈 배열로 돌아간다.
 *
 * 대화 번호도 `useRef` 라 함께 새로 생긴다 — 서버는 한 시간 들고 있는데
 * **그 번호를 잃어서 못 찾는 것**이었다.
 *
 * ── 왜 `sessionStorage` 인가 ───────────────────────────────
 *
 * 사용자가 정한 세 가지 초기화 조건이 그대로 이것이다.
 *
 *     브라우저를 종료하면    `sessionStorage` 가 비워진다
 *     로그아웃하면          우리가 지운다(`clearCsChat`)
 *     24시간이 지나면       적어 둔 시각을 보고 우리가 버린다
 *
 * `localStorage` 는 브라우저를 껐다 켜도 남아서 첫 조건에 어긋난다. 그리고
 * **남의 컴퓨터에서 쓴 대화가 남는 것**은 그 자체로 나쁘다.
 *
 * 데이터베이스에는 넣지 않는다 — 사용자가 그럴 필요 없다고 했고, 대화는 문의로
 * 넘길 때만 남으면 된다(`cs_inquiries`).
 *
 * ── 탭마다 따로다 ──────────────────────────────────────────
 *
 * `sessionStorage` 는 탭 하나에 매인다. 새 탭을 열면 새 대화다. 「브라우저
 * 종료」보다 좁은 조건이지만, 넓히려면 `localStorage` 뿐이고 그것은 위의
 * 첫 조건을 깬다. **좁은 쪽이 안전하다.**
 */

/** 화면에 그리는 말 한 마디. `lib/cs/session.ts` 의 `CsTurn` 과 같은 모양이다. */
export interface ChatTurn {
  role: "user" | "bot";
  text: string;
  sources?: Array<{ name: string; href: string }>;
  handoff?: boolean;
}

export interface ChatState {
  sessionId: string;
  turns: ChatTurn[];
  /** 마지막으로 말한 때. 24시간을 여기서 센다. */
  at: number;
}

const 열쇠 = "fixup.cs.chat";

/** 하루. 사용자가 정한 값이다. */
export const CHAT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 화면에 들고 있을 말 수.
 *
 * 서버가 스무 마디까지 들고 있다(`lib/cs/session.ts` 의 `말최대`). 화면이 더
 * 들고 있어 봐야 서버는 모르는 말이라 맥락에 못 쓴다. 같은 수로 맞춘다.
 */
const 말최대 = 20;

/**
 * 창고를 집는다. **없으면 `null`.**
 *
 * 비공개 창이나 저장을 막아 둔 브라우저에서는 `sessionStorage` 를 읽는 것만으로
 * 던진다. 그때 도우미가 통째로 안 열리면 안 된다 — 기억을 못 할 뿐이다.
 */
function 창고(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function 말들(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const turn = item as { role?: unknown; text?: unknown; sources?: unknown; handoff?: unknown };
    if (turn?.role !== "user" && turn?.role !== "bot") return [];
    if (typeof turn.text !== "string") return [];
    /*
      **없던 칸을 만들어 넣지 않는다.** 사용자 말에는 근거도 넘김 표시도
      없는데 `undefined`·`false` 를 채워 두면, 꺼낸 것이 넣은 것과 달라진다.
    */
    const 말: ChatTurn = { role: turn.role, text: turn.text };
    if (Array.isArray(turn.sources)) 말.sources = turn.sources as ChatTurn["sources"];
    if (turn.handoff === true) 말.handoff = true;
    return [말];
  });
}

/**
 * 저장해 둔 대화를 꺼낸다. **없거나 24시간이 지났으면 `null`.**
 *
 * 지난 것은 꺼낼 때 지운다 — 남겨 두면 다음에 또 읽고 또 버린다.
 */
export function readCsChat(now = Date.now()): ChatState | null {
  const 곳 = 창고();
  if (!곳) return null;

  try {
    const 날것 = 곳.getItem(열쇠);
    if (!날것) return null;

    const 담긴것 = JSON.parse(날것) as Partial<ChatState>;
    const at = typeof 담긴것.at === "number" ? 담긴것.at : 0;
    const sessionId = typeof 담긴것.sessionId === "string" ? 담긴것.sessionId : "";

    if (!sessionId || now - at > CHAT_TTL_MS) {
      곳.removeItem(열쇠);
      return null;
    }
    return { sessionId, turns: 말들(담긴것.turns), at };
  } catch {
    // 깨진 값이 남아 있으면 다음에도 걸린다. 지우고 새로 시작한다.
    try { 곳.removeItem(열쇠); } catch { /* 지우는 것마저 막혔으면 할 수 있는 게 없다 */ }
    return null;
  }
}

/** 대화를 적어 둔다. **시계는 말할 때마다 다시 선다.** */
export function writeCsChat(state: { sessionId: string; turns: readonly ChatTurn[] }, now = Date.now()): void {
  const 곳 = 창고();
  if (!곳 || !state.sessionId) return;

  try {
    곳.setItem(열쇠, JSON.stringify({
      sessionId: state.sessionId,
      // 뒤에서부터 남긴다. 최근 말이 맥락에 더 쓸모 있다.
      turns: state.turns.slice(-말최대),
      at: now,
    }));
  } catch {
    // 저장 공간이 찼거나 막혔다. 기억을 못 할 뿐 대화는 그대로 이어진다.
  }
}

/**
 * 대화를 버린다.
 *
 * **로그아웃할 때 부른다.** 남겨 두면 다음 사람이 앞사람의 대화를 본다 —
 * 잔액이나 플랜 이야기가 거기 있을 수 있다.
 */
export function clearCsChat(): void {
  const 곳 = 창고();
  if (!곳) return;
  try { 곳.removeItem(열쇠); } catch { /* 막혔으면 할 수 있는 게 없다 */ }
}
