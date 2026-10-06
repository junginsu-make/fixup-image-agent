import "server-only";

import { createHmac, randomBytes } from "node:crypto";

/**
 * **하루 방문자 값**(계획 2026-10-06 site-analytics, 보안 검토 반영).
 *
 * IP·브라우저 정보를 **이 서버 메모리에만 있는** 그날의 무작위 열쇠로 HMAC 한다. 열쇠는 DB·백업·로그
 * 어디에도 가지 않고, 한국 날짜가 바뀌면 새로 만든다. 그래서 DB 를 통째로 가져가도 IP 를 되돌릴 수 없다.
 * 원래 IP·브라우저 정보는 Supabase 로 보내지도 않는다.
 *
 * 서버가 한 대(EC2, 프로세스 하나)라는 전제다. 다시 시작하면 그날 열쇠가 바뀌어, 그날 이미 온 사람이
 * 한 번 더 세어질 수 있다(배포하는 날만).
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const koreanDay = (now: Date): string => new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

type DailyKey = { day: string; key: Buffer };
// 상태 보관 자리. 프로세스 하나에 하나.
let current: DailyKey | null = null;

function keyFor(day: string): Buffer {
  if (!current || current.day !== day) current = { day, key: randomBytes(32) };
  return current.key;
}

export function visitorHash(ip: string | null, userAgent: string, now: Date = new Date()): string {
  return createHmac("sha256", keyFor(koreanDay(now))).update(`${ip ?? ""}|${userAgent}`).digest("hex");
}
