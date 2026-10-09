import { timingSafeEqual } from "node:crypto";
import { runPurge } from "../../../../lib/retention/purge-deleted";
import { purgeTargets } from "../../../../lib/retention/purge-targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **6개월 자동 파기**(2026-10-08 사용자 결정 — 계획 3단계). 하루 한 번 서버 타이머(`fixup-image-agent-purge.timer`)가
 * 서버 안에서 부른다. 회원이 지운 지 6개월 지난 것을 관리자 완전 삭제와 같은 함수로 지운다.
 *
 * **운영 설정의 `CRON_SECRET`(32자 이상)을 머리 `x-cron-secret` 에 실어 온 요청만** 받는다. 이 주소는 밖에서도
 * 닿으므로 값이 없거나 짧으면 아예 돌지 않는다. 틀린 값에는 없는 주소처럼 답한다. 서버 한 대라 겹친 요청은
 * 메모리 표시 하나로 막는다.
 */
const MIN_SECRET = 32;
/** 이보다 오래 끝나지 않은 실행은 멈춘 것으로 본다 — 표시를 영영 쥐고 있으면 재시작 전까지 매일 409 다. */
const STALE_MS = 30 * 60 * 1000;
let runningSince: number | null = null;

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < MIN_SECRET) {
    console.error("[purge] CRON_SECRET 이 없거나 짧아 돌지 않습니다.");
    return Response.json({ ok: false }, { status: 503 });
  }
  if (!sameSecret(request.headers.get("x-cron-secret") ?? "", secret)) {
    return Response.json({ ok: false }, { status: 404 });
  }
  if (runningSince !== null && Date.now() - runningSince < STALE_MS) {
    return Response.json({ ok: false, message: "이미 지우는 중입니다." }, { status: 409 });
  }

  const started = Date.now();
  runningSince = started;
  try {
    const report = await runPurge(purgeTargets(), new Date());
    // 몇 건 지웠는지 서버 기록에 남긴다(journalctl -u fixup-image-agent).
    console.info("[purge] 6개월 지난 것을 지웠습니다", JSON.stringify(report));
    // 일부라도 못 지웠으면 실패로 답한다 — 타이머 스크립트(curl -f)가 실패로 끝나 타이머 기록에 남는다.
    const clean = Object.values(report).every((entry) => entry && !entry.failed && !entry.listFailed);
    return Response.json({ ok: clean, report }, { status: clean ? 200 : 500 });
  } catch (error) {
    console.error("[purge] 실패", error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 500 });
  } finally {
    // 멈춘 것으로 보고 넘어간 뒤 늦게 끝난 옛 실행이 새 실행의 표시를 지우지 않게.
    if (runningSince === started) runningSince = null;
  }
}
