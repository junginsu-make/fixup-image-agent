import { isPlanStage, type PdpPlanStage } from "@fixup/pdp-core";

/**
 * **기획이 어디쯤인지 잠깐 들고 있는 자리.**
 *
 * ── 왜 메모리인가 ──────────────────────────────────────────
 *
 * 이 서버는 **한 프로세스**다(`deploy/ec2/fixup-image-agent.service`:
 * `ExecStart=/usr/bin/node server.js`). 기획 요청을 받은 그 프로세스가 물음도
 * 받는다.
 *
 * 표를 하나 더 만들 수도 있었다. 그러면 마이그레이션이 필요하고, 4분짜리
 * 대기 하나에 3초마다 데이터베이스를 두드리게 된다. **10분 뒤면 아무 값어치도
 * 없는 값**을 그렇게까지 남길 까닭이 없다.
 *
 * ── 여러 대가 되면 ─────────────────────────────────────────
 *
 * 물음이 다른 프로세스로 가면 **모른다고 답한다.** 그때 화면은 예전처럼 한
 * 줄짜리 안내로 되돌아간다 — 기획 자체는 멀쩡히 돈다. 조용히 틀린 단계를
 * 지어내지 않는 쪽이 낫다.
 */

/** 10분이면 아무리 느린 기획도 끝나 있다. 넘으면 없는 것으로 본다. */
const 수명 = 10 * 60 * 1000;

/** 한 번에 들고 있을 수 있는 수. 넘으면 오래된 것부터 버린다. */
const 최대 = 500;

interface 기록 {
  stage: PdpPlanStage;
  /** 누구 것인가. 남이 물으면 안 알려 준다. */
  memberId: string;
  at: number;
}

const 장부 = new Map<string, 기록>();

function 쓸어낸다(now: number) {
  for (const [id, entry] of 장부) {
    if (now - entry.at > 수명) 장부.delete(id);
  }
  // 그래도 넘치면 앞(오래된 것)부터 버린다. `Map` 은 넣은 순서를 지킨다.
  while (장부.size > 최대) {
    const 첫째 = 장부.keys().next();
    if (첫째.done) break;
    장부.delete(첫째.value);
  }
}

/**
 * **이 번호를 믿을 수 있는가.**
 *
 * 화면이 만들어 보내는 값이라 그대로 열쇠로 쓰면 아무 글자나 들어온다. 길이와
 * 글자를 못 박는다 — 여기서 거른 것만 장부에 오른다.
 */
export function isPlanProgressId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

export function markPlanStage(id: string, memberId: string, stage: PdpPlanStage) {
  if (!isPlanProgressId(id) || !memberId || !isPlanStage(stage)) return;

  const now = Date.now();
  쓸어낸다(now);
  장부.set(id, { stage, memberId, at: now });
}

/**
 * 지금 단계. 모르면 `null` 이다.
 *
 * **남의 것은 안 알려 준다.** 번호를 찍어 맞히더라도 그 사람 것이 아니면
 * 없는 것과 같이 답한다.
 */
export function readPlanStage(id: unknown, memberId: string): PdpPlanStage | null {
  if (!isPlanProgressId(id) || !memberId) return null;

  const entry = 장부.get(id);
  if (!entry) return null;
  if (entry.memberId !== memberId) return null;
  if (Date.now() - entry.at > 수명) {
    장부.delete(id);
    return null;
  }

  return entry.stage;
}

/** 기획이 끝났다. 더 들고 있을 까닭이 없다. */
export function clearPlanStage(id: unknown) {
  if (isPlanProgressId(id)) 장부.delete(id);
}

/** 시험 전용. 프로세스 하나를 여러 시험이 나눠 쓰므로 사이를 비운다. */
export function resetPlanProgressForTest() {
  장부.clear();
}
