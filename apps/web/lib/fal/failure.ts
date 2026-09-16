/**
 * fal 이 실패했을 때 **누구 잘못인가.**
 *
 * 2026-09-16 실측: 포스터를 글만으로 만들었더니 fal 이 `422` 로 거절했다 —
 * 「content checker」에 걸린 것이고, 청구는 `$0.00` 이었다. 그런데 화면에는
 * 「500 Internal Server Error」만 떴다. 사용자는 **자기 요청이 거절된 것인지 우리
 * 서버가 죽은 것인지 알 수 없었다.** 그리고 돈이 안 나갔는데도 예약한 장이 10분
 * 동안(`reserve_generation` 의 `interval '10 minutes'`) 한도에서 묶여 있었다.
 *
 * fal 클라이언트는 4xx·5xx 를 **예외로** 던진다 — `ApiError`(422 는
 * `ValidationError`)에 `status` 를 실어서(`@fal-ai/client` 의 `response.js`).
 * 그래서 `catch` 에 들어온 것이 「제공자가 거절」인지 「우리가 터짐」인지는 그
 * `status` 하나로 갈린다.
 *
 * **화면 밖에서 가른다.** 라우트의 `catch` 안에 두면 「4xx 를 4xx 로 내보내는가」·
 * 「예약을 푸는가」를 값으로 못 잰다.
 */

export type FalFailureKind =
  /** 요청 자체가 거절됐다. 내용 정책·잘못된 입력 등. 다시 눌러도 같다. */
  | "rejected"
  /** 결과가 사라졌다. 만료·삭제·용량 한도. 다시 만들면 된다. */
  | "gone"
  /** 한도·혼잡. 그대로 다시 하면 된다. */
  | "busy"
  /** 제공자가 터졌다. 우리 잘못이 아니다. */
  | "provider_fault"
  /** 우리 쪽에서 터졌다. 저장 실패 등. */
  | "fault";

export interface FalFailureVerdict {
  kind: FalFailureKind;
  /** 제공자가 준 HTTP 상태. 우리 쪽에서 터졌으면 없다. */
  status?: number;
  /** 우리가 브라우저에 돌려줄 상태. */
  httpStatus: number;
  /** 사람에게 할 말. 무엇을 해야 하는지까지 적는다. */
  message: string;
  /** 제공자가 준 원문. 운영자가 이것으로 fal 기록을 찾는다. */
  detail: string;
  /**
   * 묶어 둔 장을 **지금** 풀어야 하는가.
   *
   * 제공자가 거절했으면 그리지 않았고 청구도 없다 — 바로 푼다. 우리 쪽에서
   * 터졌으면 어디서 터졌는지 모른다. fal 은 이미 그려서 돈을 받았을 수 있으므로
   * 풀지 않고 만료에 맡긴다 — 공짜로 한 장을 주는 것보다 낫다.
   */
  releaseReservation: boolean;
}

/** fal 이 실은 HTTP 상태. 없으면 우리 쪽에서 터진 것이다. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

export function classifyFalFailure(error: unknown): FalFailureVerdict {
  const status = statusOf(error);
  const detail = messageOf(error);

  if (status === undefined) {
    return {
      kind: "fault",
      httpStatus: 500,
      message: "만든 그림을 가져오지 못했습니다. 잠시 뒤 다시 확인해 주세요.",
      detail,
      releaseReservation: false,
    };
  }

  /*
   * **429 를 거절로 읽지 않는다.** 한도에 걸린 것이라 그대로 다시 하면 된다.
   * 되돌릴 수 없는 거절처럼 말하면 사용자가 포기한다.
   */
  if (status === 429) {
    return {
      kind: "busy",
      status,
      httpStatus: 429,
      message: "지금 요청이 몰려 있습니다. 잠시 뒤 다시 눌러 주세요.",
      detail,
      releaseReservation: true,
    };
  }

  /*
   * **결과가 사라진 것은 거절이 아니다.**
   *
   * fal 이 「This request has no output」을 돌려주는 경우다 — 만료됐거나,
   * 지워졌거나, 용량 한도로 저장되지 않았다(2026-09-16 사용자 보고). 오래된
   * 작업을 다시 열 때 생긴다.
   *
   * 거절로 묶으면 「지시 문구를 바꾸세요」라고 말하게 되는데, **문구는 멀쩡했고
   * 결과만 사라진 것**이라 틀린 안내다.
   *
   * **404 를 그대로 돌려주지 않는다.** 화면의 셸 폴러가 404 를 「작업이 아예
   * 없다」로 읽고 목록에서 지운다(`running-jobs.tsx` 의 `if (response.status
   * === 404) finish(job.id)`). 작업은 있고 결과만 없으므로 410 으로 알린다.
   */
  if (status === 404 || status === 410) {
    return {
      kind: "gone",
      status,
      httpStatus: 410,
      message: "만든 그림이 남아 있지 않습니다. 시간이 지나 지워진 것이라 다시 만들어 주세요.",
      detail,
      releaseReservation: true,
    };
  }

  if (status >= 500) {
    return {
      kind: "provider_fault",
      status,
      httpStatus: 502,
      message: "그림 생성 쪽에 문제가 있습니다. 잠시 뒤 다시 눌러 주세요.",
      detail,
      releaseReservation: true,
    };
  }

  /*
   * 4xx. **요청이 거절된 것이고 다시 눌러도 같다.**
   *
   * 422 가 가장 흔하다 — 내용 검사에 걸리는 경우다. 무엇에 걸렸는지는 제공자만
   * 알고 우리에게는 원문뿐이라, 우리가 짐작해 적지 않는다. 대신 원문을 함께
   * 남겨 운영자가 fal 기록을 찾을 수 있게 한다.
   */
  return {
    kind: "rejected",
    status,
    httpStatus: status,
    message:
      "그림 생성 쪽에서 이 요청을 거절했습니다. 같은 내용으로 다시 눌러도 같은 결과입니다. "
      + "지시 문구를 바꾸거나 다른 모델로 시도해 보세요.",
    detail,
    releaseReservation: true,
  };
}
