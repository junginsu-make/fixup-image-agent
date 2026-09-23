/**
 * **지금 사용자가 무엇을 할 수 있나.**
 *
 * ── 왜 화면 밖에 있나 ────────────────────────────────────────
 *
 * `.tsx` 안에 두면 값으로 못 잰다. 2026-09-16 에 「제품 보존을 세느냐」가 화면
 * 안에 있어서 값 시험을 다 통과한 채로 틀려 있었다 — 그 뒤로 이 저장소는 판단을
 * 순수 함수로 뺀다.
 *
 * ── Easy 는 되묻지 않는다 ────────────────────────────────────
 *
 * 2026-09-02 설계의 `turn.ts` 는 **되묻기**가 핵심이었다 — 빈칸이 있으면 물어서
 * 채웠다. Easy 는 그것을 버렸다(설계 §6). 뺄수록 쉬워지고, 뺄수록 어긋날 수
 * 있는데 그 맞바꿈을 눈 뜨고 했다.
 *
 * 그래서 이 함수가 하는 일은 훨씬 작다 — 「무엇을 더 물어야 하나」가 아니라
 * **「지금 입력창을 열어도 되나」**다.
 */

export interface EasyMessage {
  id: string;
  role: "user" | "system" | "image" | "assistant";
  body: string;
  /** 그림 줄이면 라이브러리의 결과물을 가리킨다(설계 §4-1). */
  workId?: string;
}

export interface EasyTurnInput {
  messages: readonly EasyMessage[];
  /** 지금 붙어 있는 그림들. */
  attachments: readonly string[];
  /** 보내는 중인가. */
  sending: boolean;
  /** 「없이 시작」을 눌렀나. */
  startedWithout?: boolean;
}

export interface EasyTurn {
  /** 붙일지 묻는 단추를 보일까. */
  showsAttachChoice: boolean;
  /** 입력창을 쓸 수 있나. */
  canSend: boolean;
  /** 지금 무언가 돌고 있나. */
  busy: boolean;
}

export function easyTurn(input: EasyTurnInput): EasyTurn {
  /*
   * **한 번 말을 걸었으면 다시 묻지 않는다.**
   *
   * 붙일지 묻는 것은 **첫 화면에서 한 번**이다(설계 §1 — 「붙일지 한 번 묻고,
   * 그 다음은 사용자가 친 말 그대로 만든다」). 결과가 나온 뒤에 또 물으면
   * 되묻기가 되고, 그것을 뺀 것이 이 모드의 뜻이다.
   */
  const 말을걸었나 = input.messages.some((message) => message.role !== "system");
  const 붙였나 = input.attachments.length > 0;

  /*
    **붙였다고 닫지 않는다** (2026-09-23 사용자).

    전에는 한 장만 붙어도 이 화면이 사라졌다. 그런데 라이브러리로 가는 길이
    여기뿐이라, 두 장째부터는 고를 수가 없었다. 말을 걸기 전까지는 남겨 둔다.
  */
  const showsAttachChoice = !말을걸었나 && !input.startedWithout;

  return {
    showsAttachChoice,
    /*
     * **보내는 중에는 잠근다**(설계 §11-②).
     *
     * 엔터가 곧 생성이다. 실수로 두 번 치면 두 번 값이 나가고 되돌릴 수 없다.
     */
    /*
      선택 화면이 남아 있어도 **한 장이라도 붙였으면 입력창을 연다.** 예전에는
      「선택 화면이 없으면 열린다」였는데, 화면을 남기기로 하면서 그 둘을 떼었다.
    */
    canSend: (붙였나 || 말을걸었나 || Boolean(input.startedWithout)) && !input.sending,
    busy: input.sending,
  };
}
