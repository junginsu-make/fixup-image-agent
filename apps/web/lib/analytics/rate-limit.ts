/**
 * **한 IP 가 몰아치면 끊는다**(계획 2026-10-06 site-analytics).
 *
 * `/api/track` 은 로그인 없이 열린 자리라 누구나 DB 에 줄을 쌓을 수 있다. 서버가 한 대(EC2)라
 * 프로세스 안 메모리로 충분하다. `windows` Map 은 상태 보관 자리라 바뀐다 — 그 안의 값은 매번 새로 만든다.
 */
export type Window = { startedAt: number; count: number };

export function nextWindow(prev: Window | undefined, now: number, windowMs: number): Window {
  if (!prev || now - prev.startedAt >= windowMs) return { startedAt: now, count: 1 };
  return { ...prev, count: prev.count + 1 };
}

export function createLimiter({ limit, windowMs, maxKeys }: { limit: number; windowMs: number; maxKeys: number }) {
  const windows = new Map<string, Window>();
  return (key: string, now: number = Date.now()): boolean => {
    if (windows.size >= maxKeys) windows.clear();
    const next = nextWindow(windows.get(key), now, windowMs);
    windows.set(key, next);
    return next.count <= limit;
  };
}
