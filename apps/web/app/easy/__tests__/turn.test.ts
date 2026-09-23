import { describe, expect, it } from "vitest";
import { easyTurn, type EasyMessage } from "../turn";

/**
 * **지금 사용자가 무엇을 할 수 있나** (설계 §10).
 *
 * 화면 안에 두면 값으로 못 잰다. 이 저장소가 계속 지켜 온 방식이다 — 2026-09-16
 * 에 「제품 보존을 세느냐」가 `.tsx` 안에 있어서 값 시험을 다 통과한 채로 틀려
 * 있었다.
 *
 * **Easy 는 되묻지 않는다**(설계 §6). 그래서 이 함수가 하는 일은 앞선 2026-09-02
 * 설계의 `turn.ts` 보다 훨씬 작다 — 「무엇을 더 물어야 하나」가 아니라 「지금
 * 입력창을 열어도 되나」다.
 */

const 인사: EasyMessage = { id: "1", role: "system", body: "그림을 붙이시겠어요?" };
const 내말: EasyMessage = { id: "2", role: "user", body: "해 질 녘 바닷가" };
const 그림: EasyMessage = { id: "3", role: "image", body: "", workId: "w1" };

describe("첫 화면", () => {
  it("붙일지 묻는 단추를 보인다", () => {
    const turn = easyTurn({ messages: [인사], attachments: [], sending: false });

    expect(turn.showsAttachChoice).toBe(true);
    expect(turn.canSend).toBe(false);
  });

  /**
   * **안 붙이고도 만들 수 있다**(설계 §8 — 글만으로 만드는 길은 원래 열려 있다).
   * 「없이 시작」을 누르면 단추가 사라지고 입력창이 열린다.
   */
  it("없이 시작하면 입력창이 열린다", () => {
    const turn = easyTurn({ messages: [인사], attachments: [], sending: false, startedWithout: true });

    expect(turn.showsAttachChoice).toBe(false);
    expect(turn.canSend).toBe(true);
  });

  /**
   * **붙였다고 선택 화면을 닫지 않는다** (2026-09-23 사용자).
   *
   * 전에는 한 장만 붙어도 이 화면이 사라져서, 라이브러리에서 더 고르려면 갈 길이
   * 없었다. 말을 걸기 전까지는 남겨 두어 연이어 붙일 수 있게 한다.
   */
  it("그림을 붙여도 선택 화면은 남고, 입력창은 열린다", () => {
    const turn = easyTurn({ messages: [인사], attachments: ["a"], sending: false });

    expect(turn.showsAttachChoice).toBe(true);
    expect(turn.canSend).toBe(true);
  });

  it("말을 걸면 선택 화면이 사라진다", () => {
    const turn = easyTurn({ messages: [인사, 내말], attachments: ["a"], sending: false });

    expect(turn.showsAttachChoice).toBe(false);
    expect(turn.canSend).toBe(true);
  });
});

describe("보내는 중", () => {
  /**
   * **입력창을 잠근다**(설계 §11-②).
   *
   * 엔터가 곧 생성이다. 실수로 두 번 치면 **두 번 값이 나간다.** 되돌릴 수 없다.
   */
  it("보내는 중에는 못 보낸다", () => {
    const turn = easyTurn({ messages: [인사, 내말], attachments: ["a"], sending: true });

    expect(turn.canSend).toBe(false);
    expect(turn.busy).toBe(true);
  });

  it("끝나면 다시 보낼 수 있다", () => {
    const turn = easyTurn({ messages: [인사, 내말, 그림], attachments: ["a"], sending: false });

    expect(turn.canSend).toBe(true);
    expect(turn.busy).toBe(false);
  });
});

describe("이미 대화가 있으면", () => {
  /** 한 번 말을 걸었으면 붙일지 다시 묻지 않는다. 되묻지 않는다(설계 §6). */
  it("붙일지 다시 묻지 않는다", () => {
    const turn = easyTurn({ messages: [인사, 내말, 그림], attachments: [], sending: false });

    expect(turn.showsAttachChoice).toBe(false);
    expect(turn.canSend).toBe(true);
  });
});

describe("한 번 더 만들 수 있나", () => {
  /**
   * **③~⑥ 을 몇 번이든 되풀이한다**(설계 §3). 새 프롬프트를 치면 붙인 그림은
   * 그대로 두고 다시 만든다.
   */
  it("결과가 나온 뒤에도 보낼 수 있다", () => {
    const turn = easyTurn({ messages: [인사, 내말, 그림], attachments: ["a"], sending: false });

    expect(turn.canSend).toBe(true);
  });
});
