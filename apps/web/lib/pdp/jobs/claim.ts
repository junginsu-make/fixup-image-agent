import { createHash } from "node:crypto";
import type { GenerationState } from "./state";

/**
 * 같은 요청인가, 다른 요청인가.
 *
 * ── 두 가지 사고를 동시에 막는다 ───────────────────────────────
 *
 * **같은 것을 두 번 만들기.** 네트워크가 끊겼거나 사용자가 두 번 눌렀을 때
 * 이미 값을 치른 작업을 또 만들면 두 번 낸다.
 *
 * **다른 것을 같은 것으로 보기.** 구성안을 고치고 다시 눌렀는데 옛 결과를
 * 돌려주면, 사용자는 고친 대로 만들어진 줄 안다. 이쪽이 더 나쁘다 — 틀린 것을
 * 맞다고 믿게 만든다.
 *
 * 그래서 요청 key 만으로 판단하지 않고 **내용의 지문**을 함께 본다.
 */

/** 지문에 들어가는 것. 이 중 하나라도 다르면 다른 작업이다. */
export interface JobFingerprintInput {
  documentId: string;
  /** 승인된 revision. 구성안을 고치면 올라간다. */
  revision: number;
  operation: string;
  sectionIds: string[];
  imageModel: string;
  aspectRatio: string;
}

export function fingerprintOf(input: JobFingerprintInput): string {
  /*
    **섹션 순서는 지문에 넣지 않는다.** 같은 섹션 묶음을 어떤 차례로 적어 보내든
    만드는 것은 같다. 순서를 넣으면 화면이 정렬을 바꾸는 날 같은 작업이 두 번
    만들어진다.
  */
  const payload = JSON.stringify({
    documentId: input.documentId,
    revision: input.revision,
    operation: input.operation,
    sectionIds: [...input.sectionIds].sort(),
    imageModel: input.imageModel,
    aspectRatio: input.aspectRatio,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export interface ExistingJob {
  id: string;
  fingerprint: string;
  generation: GenerationState;
  /** 지금 누가 돌리고 있는가. 없으면 아무도 안 잡았다. */
  leaseUntil: Date | null;
}

export type SubmissionResolution =
  | { kind: "create" }
  | { kind: "existing"; jobId: string }
  | { kind: "conflict"; reason: "fingerprint_mismatch" };

/**
 * 같은 key 로 들어온 요청을 어떻게 할 것인가.
 *
 * **끝난 작업도 같은 내용이면 그것을 돌려준다.** 다시 만들면 두 번 낸다.
 * 사용자가 진짜로 다시 만들고 싶으면 화면이 새 key 를 쥐여 준다 — 그것이
 * 「의도적인 재생성」이고, 우연한 재전송과 구별된다(설계 §4 불변 조건 3).
 */
export function resolveSubmission(
  existing: ExistingJob | null,
  fingerprint: string,
): SubmissionResolution {
  if (!existing) return { kind: "create" };
  if (existing.fingerprint !== fingerprint) {
    return { kind: "conflict", reason: "fingerprint_mismatch" };
  }
  return { kind: "existing", jobId: existing.id };
}

/**
 * 이 작업을 지금 잡아도 되는가.
 *
 * **잡은 채로 죽는 경우를 전제한다.** 워커가 배포·재시작·크래시로 사라지면
 * 그 작업은 아무도 안 돌린다. 시간이 지나면 풀리게 해서 다른 워커가 이어받는다.
 *
 * 실제 claim 은 DB 에서 원자적으로 해야 한다(설계 §8.2). 이 함수는 그 조건을
 * **값으로 잴 수 있게** 떼어 둔 것이다.
 */
export function leaseExpiredAt(leaseUntil: Date | null, now: Date): boolean {
  if (!leaseUntil) return true;
  // 경계에서는 살아 있다고 본다. 둘이 동시에 잡는 것보다 한 박자 늦는 편이 낫다.
  return leaseUntil.getTime() < now.getTime();
}
