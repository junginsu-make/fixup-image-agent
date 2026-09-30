import "server-only";
import { randomUUID } from "node:crypto";

/**
 * **이 프로세스의 표식.** 뜰 때 한 번 만든다(설계 §3.5).
 *
 * 예약마다 이 값을 남기고(`reserveAiUsage`), 다음 프로세스가 켜질 때 「내 것이 아닌 예약」을
 * 가려 정리한다(`credit_close_restart_orphans`). 웹 프로세스가 하나라는 전제다 — 둘이 되면
 * 살아 있는 형제의 예약을 고른다.
 *
 * **모듈 스코프 상수 대신 `globalThis` 에 심는다**(R1). Next 는 이 모듈을 `instrumentation.ts`
 * 와 라우트 핸들러처럼 서로 다른 번들 레이어에서 따로 인스턴스화할 수 있는데, 그러면 기동
 * 정리가 부르는 값과 예약이 적는 값이 갈려, 방금 뜬 이 프로세스의 새 예약을 「내 것이
 * 아니다」로 착각해 닫아버릴 수 있다.
 */
const holder = globalThis as typeof globalThis & { __fixupBootId?: string };
export const BOOT_ID: string = (holder.__fixupBootId ??= randomUUID());
