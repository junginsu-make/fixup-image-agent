import { beforeEach, describe, expect, it } from "vitest";
import { CHAT_TTL_MS, clearCsChat, readCsChat, writeCsChat } from "../chat-store";

/**
 * **화면을 옮겨도 대화가 남는다**(2026-09-28 사용자 요청).
 *
 * > 페이지를 이동해도 유지 됐으면 합니다. 웹 브라우저를 아예 종료하거나
 * > 로그아웃 하거나, 24시간이 지나면 초기화 되는 기준이였으면 좋겠습니다.
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * 초기화 조건 셋이 그대로다.
 *   ① 브라우저 종료 — `sessionStorage` 를 쓰는지
 *   ② 로그아웃 — `clearCsChat` 이 지우는지
 *   ③ 24시간 — 지난 것을 꺼내지 않는지
 *
 * 그리고 **못 저장해도 도우미가 죽지 않는지.** 비공개 창에서는 창고를 읽는
 * 것만으로 던진다.
 */

/** 가짜 `sessionStorage`. 진짜처럼 글자만 담는다. */
function 가짜창고() {
  const 안 = new Map<string, string>();
  return {
    getItem: (k: string) => 안.get(k) ?? null,
    setItem: (k: string, v: string) => { 안.set(k, String(v)); },
    removeItem: (k: string) => { 안.delete(k); },
    clear: () => { 안.clear(); },
    key: (i: number) => [...안.keys()][i] ?? null,
    get length() { return 안.size; },
    안,
  };
}

let 창고 = 가짜창고();

function 창고를놓는다(값: unknown) {
  Object.defineProperty(globalThis, "window", {
    value: { sessionStorage: 값 },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  창고 = 가짜창고();
  창고를놓는다(창고);
});

const 말 = { role: "user" as const, text: "크레딧이 뭔가요?" };

describe("화면을 옮겨도 남는다", () => {
  it("**적어 두면 다시 꺼낼 수 있다**", () => {
    writeCsChat({ sessionId: "chat-1", turns: [말] });

    expect(readCsChat()?.sessionId).toBe("chat-1");
    expect(readCsChat()?.turns).toEqual([말]);
  });

  /**
   * **대화 번호가 핵심이다.** 번호를 잃으면 서버가 들고 있는 대화를 못 찾고,
   * 도우미는 앞의 말을 모르는 채로 답한다.
   */
  it("**대화 번호가 그대로 남는다**", () => {
    writeCsChat({ sessionId: "chat-abcdef", turns: [] });

    expect(readCsChat()?.sessionId).toBe("chat-abcdef");
  });

  it("**없으면 없다고 한다**", () => {
    expect(readCsChat()).toBeNull();
  });

  /** 화면이 스무 마디까지만 들고 있다. 서버와 같은 수다. */
  it("**너무 많으면 최근 것만 남긴다**", () => {
    const 많이 = Array.from({ length: 40 }, (_, i) => ({ role: "user" as const, text: `${i}` }));

    writeCsChat({ sessionId: "chat-1", turns: 많이 });

    const 남은것 = readCsChat()!.turns;
    expect(남은것.length).toBe(20);
    expect(남은것.at(-1)?.text, "오래된 쪽을 남겼다").toBe("39");
  });
});

describe("초기화 조건 셋", () => {
  /**
   * **브라우저를 종료하면 사라진다.** `sessionStorage` 가 그 일을 한다 —
   * `localStorage` 를 쓰면 껐다 켜도 남아서 조건이 깨진다.
   */
  it("**`sessionStorage` 에 담는다**", () => {
    writeCsChat({ sessionId: "chat-1", turns: [말] });

    expect(창고.안.size, "sessionStorage 에 안 담겼다").toBe(1);
  });

  it("**로그아웃하면 지운다**", () => {
    writeCsChat({ sessionId: "chat-1", turns: [말] });
    clearCsChat();

    expect(readCsChat(), "앞사람의 대화가 남았다").toBeNull();
    expect(창고.안.size).toBe(0);
  });

  it("**24시간이 지나면 안 꺼낸다**", () => {
    const 지금 = 1_700_000_000_000;
    writeCsChat({ sessionId: "chat-1", turns: [말] }, 지금);

    expect(readCsChat(지금 + CHAT_TTL_MS - 1000), "아직 안 지났는데 버렸다").not.toBeNull();
    expect(readCsChat(지금 + CHAT_TTL_MS + 1000), "지났는데 남겼다").toBeNull();
  });

  it("**지난 것은 꺼낼 때 지운다** — 남겨 두면 또 읽고 또 버린다", () => {
    const 지금 = 1_700_000_000_000;
    writeCsChat({ sessionId: "chat-1", turns: [말] }, 지금);

    readCsChat(지금 + CHAT_TTL_MS + 1000);

    expect(창고.안.size).toBe(0);
  });

  /** 시계는 말할 때마다 다시 선다. 대화하는 중에 끊기면 안 된다. */
  it("**다시 적으면 시계가 다시 선다**", () => {
    const 지금 = 1_700_000_000_000;
    writeCsChat({ sessionId: "chat-1", turns: [말] }, 지금);
    writeCsChat({ sessionId: "chat-1", turns: [말, 말] }, 지금 + CHAT_TTL_MS - 1000);

    expect(readCsChat(지금 + CHAT_TTL_MS + 1000), "첫 시각으로 버렸다").not.toBeNull();
  });
});

/**
 * **못 저장해도 도우미는 돌아야 한다.** 비공개 창이나 저장을 막아 둔
 * 브라우저에서는 창고를 읽는 것만으로 던진다.
 */
describe("창고가 없거나 막혔을 때", () => {
  it("**창이 없으면 조용히 넘어간다**", () => {
    Object.defineProperty(globalThis, "window", { value: undefined, writable: true, configurable: true });

    expect(() => writeCsChat({ sessionId: "chat-1", turns: [말] })).not.toThrow();
    expect(readCsChat()).toBeNull();
    expect(() => clearCsChat()).not.toThrow();
  });

  it("**읽기가 막혀 있어도 안 죽는다**", () => {
    창고를놓는다({
      getItem: () => { throw new Error("막혔다"); },
      setItem: () => { throw new Error("막혔다"); },
      removeItem: () => { throw new Error("막혔다"); },
    });

    expect(readCsChat()).toBeNull();
    expect(() => writeCsChat({ sessionId: "chat-1", turns: [말] })).not.toThrow();
    expect(() => clearCsChat()).not.toThrow();
  });

  it("**저장 공간이 차도 안 죽는다**", () => {
    창고를놓는다({ ...가짜창고(), setItem: () => { throw new Error("QuotaExceeded"); } });

    expect(() => writeCsChat({ sessionId: "chat-1", turns: [말] })).not.toThrow();
  });
});

/**
 * **담긴 값을 믿지 않는다.** 사용자가 개발자 도구로 고칠 수 있고, 옛 판이
 * 남아 있을 수도 있다.
 */
describe("담긴 값", () => {
  it("**깨진 글은 버리고 지운다**", () => {
    창고.안.set("fixup.cs.chat", "{이건 JSON 이 아니다");

    expect(readCsChat()).toBeNull();
    expect(창고.안.size, "깨진 값이 남아 다음에도 걸린다").toBe(0);
  });

  it("**번호가 없으면 못 쓴다**", () => {
    창고.안.set("fixup.cs.chat", JSON.stringify({ turns: [말], at: Date.now() }));

    expect(readCsChat()).toBeNull();
  });

  it("**모르는 말은 버린다**", () => {
    창고.안.set("fixup.cs.chat", JSON.stringify({
      sessionId: "chat-1",
      at: Date.now(),
      turns: [{ role: "admin", text: "몰래 넣은 말" }, 말, { role: "user", text: 12 }],
    }));

    expect(readCsChat()?.turns).toEqual([말]);
  });

  it("**대화가 배열이 아니면 빈 것으로 본다**", () => {
    창고.안.set("fixup.cs.chat", JSON.stringify({ sessionId: "chat-1", at: Date.now(), turns: "글자" }));

    expect(readCsChat()?.turns).toEqual([]);
  });

  /** 번호가 없으면 적지 않는다. 번호 없는 대화는 이어 붙일 데가 없다. */
  it("**번호 없이 적으려 하면 안 적는다**", () => {
    writeCsChat({ sessionId: "", turns: [말] });

    expect(창고.안.size).toBe(0);
  });
});
