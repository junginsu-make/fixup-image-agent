/**
 * 합성이 서버를 통째로 묶지 못하게 막는다.
 *
 * 미리보기는 fal 도 LLM 도 안 부르지만 **CPU 는 실제로 쓴다.** 2KB 짜리 JSON
 * 하나가 몇 초를 부르므로, 본문 크기 제한으로는 못 막는다 — 막아야 하는 것은
 * 바이트가 아니라 일의 양이다.
 *
 * 진짜 희소 자원은 **libuv 스레드풀(기본 4)** 이다. sharp 가 그 풀을 쓰므로
 * 무거운 합성 넷이 겹치면 다른 모든 요청의 파일 읽기·DNS 까지 함께 굶는다.
 * 그래서 회원별 상한만으로는 부족하고 전체 상한이 함께 필요하다.
 *
 * 넘치면 **줄 세우지 않고 바로 거절한다.** 줄은 밀린 일을 메모리로 옮길 뿐이고,
 * 차례가 올 때쯤 사람은 이미 창을 닫았다.
 *
 * **이 셈은 프로세스 안에만 있다.** 지금 배포는 `node server.js` 한 프로세스가
 * 127.0.0.1:3000 하나로 도는 구조라 이것이 전체 그림이다. 인스턴스를 둘로
 * 늘리는 날 이 상한은 소리 없이 반쪽이 된다 — 그때는 공유 저장소로 옮겨야 한다.
 */

/** 한 사람이 동시에 돌릴 수 있는 합성. */
export const PER_USER_LIMIT = 1;
/** 서버 전체에서 동시에 돌릴 수 있는 합성. 스레드풀이 넷이라 여유를 남긴다. */
export const TOTAL_LIMIT = 2;

export class RenderBusyError extends Error {
  readonly status = 429;
  constructor(message: string) {
    super(message);
    this.name = "RenderBusyError";
  }
}

const perUser = new Map<string, number>();
let active = 0;

export function renderLoad(): { active: number; users: number } {
  return { active, users: perUser.size };
}

export async function withRenderSlot<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const mine = perUser.get(userId) ?? 0;
  if (mine >= PER_USER_LIMIT) {
    throw new RenderBusyError("앞서 요청한 그리기가 아직 끝나지 않았습니다. 끝나면 다시 눌러 주세요.");
  }
  if (active >= TOTAL_LIMIT) {
    throw new RenderBusyError("지금 서버가 그리는 중입니다. 잠시 뒤에 다시 눌러 주세요.");
  }

  perUser.set(userId, mine + 1);
  active += 1;
  try {
    return await work();
  } finally {
    active -= 1;
    const left = (perUser.get(userId) ?? 1) - 1;
    if (left > 0) perUser.set(userId, left);
    else perUser.delete(userId);
  }
}
