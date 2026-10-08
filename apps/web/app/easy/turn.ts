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

/*
  **첫 인사말 — 묻지 않고 안내한다** (2026-10-08 사용자).

  전에는 「이미지를 붙이시겠어요?」라고 묻고 그 밑에 세 단추를 두었다. 입력창
  옆 단추가 같은 일을 하므로 단추는 지우고, 무엇을 할 수 있는지만 알려 준다.
*/
export const EASY_GREETING: EasyMessage = {
  id: "greeting",
  role: "system",
  body:
    "안녕하세요. 만들고 싶은 이미지를 편하게 말씀해 주세요.\n" +
    "참고할 사진이 있다면 입력창 옆 단추로 직접 올리거나 라이브러리에서 불러올 수 있습니다. " +
    "사진 없이 바로 시작하셔도 괜찮습니다.",
};

export interface EasyTurnInput {
  messages: readonly EasyMessage[];
  /** 지금 붙어 있는 그림들. */
  attachments: readonly string[];
  /** 보내는 중인가. */
  sending: boolean;
}

export interface EasyTurn {
  /** 입력창을 쓸 수 있나. */
  canSend: boolean;
  /** 지금 무언가 돌고 있나. */
  busy: boolean;
}

export function easyTurn(input: EasyTurnInput): EasyTurn {
  /*
    **첫 화면부터 입력창을 연다** (2026-10-08 사용자).

    전에는 붙일지 묻는 단추를 누르거나 그림을 붙여야 열렸다. 그 단추를 지웠으니
    막을 까닭이 없다 — 그림 없이 말로만 만드는 길은 원래 열려 있다(설계 §8).
  */
  return {
    /*
     * **보내는 중에는 잠근다**(설계 §11-②).
     *
     * 엔터가 곧 생성이다. 실수로 두 번 치면 두 번 값이 나가고 되돌릴 수 없다.
     */
    canSend: !input.sending,
    busy: input.sending,
  };
}
