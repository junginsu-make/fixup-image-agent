/**
 * **연결이 끊긴 오류 글을 화면에 싣지 않는다**(2026-10-07 후속 Task 11 3차).
 *
 * 연결이 끊기면 `fetch` 가 `TypeError: Failed to fetch` 같은 브라우저 영어 글로 던지고, 쉽게 화면은
 * 잡은 글을 그대로 보였다. 받기 전에 던진 것만 우리 문장으로 바꾼다. 응답을 받은 실패(서버가 준 말)는
 * 이 함수를 지나지 않는다. 다시 하기 표시(`retryable`)는 전처럼 비워 둔다(전의 TypeError 도 없었다).
 */
export async function orSay<T>(work: Promise<T>, message: string): Promise<T> {
  try {
    return await work;
  } catch {
    throw new Error(message);
  }
}

export const UPLOAD_OFFLINE = "그림을 올리지 못했습니다. 잠시 뒤 다시 올려 주세요.";

/**
 * 말을 보냈는데 답을 못 받았다. 서버는 이미 받아 만들기 시작했을 수 있다. 바로 다시 보내면 값이 또 들
 * 수 있어, 대화를 다시 열어 보라고 먼저 말한다(다시 열면 만드는 중인 그림을 이어 받는다).
 */
export const SEND_OFFLINE = "답을 받지 못했습니다. 이미 시작했을 수 있으니 이 대화를 다시 열어 확인한 뒤 다시 보내 주세요.";

/** 답만 끊겼을 수 있다(서버는 이미 했을 수 있다). 말 보내기처럼 확인부터 하게 한다. */
export const CARDNEWS_OFFLINE = "답을 받지 못했습니다. 이미 했을 수 있으니 이 대화를 다시 열어 확인한 뒤 다시 해 주세요.";
