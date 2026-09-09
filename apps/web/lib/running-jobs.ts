import { z } from "zod";

/**
 * 지금 만들고 있는 것들.
 *
 * 생성은 브라우저가 이끈다. 우리가 fal 에 요청을 보내 두면 fal 은 알아서
 * 그리지만, **결과를 받아 오는 것은 화면**이다. 그래서 만드는 도중에 다른
 * 화면으로 가면 회수가 멈췄다. fal 은 계속 그리고 있고 요청 번호도 장부에
 * 남아 있어서 그 화면으로 돌아오면 이어졌지만, 돌아오기 전까지는 아무 일도
 * 일어나지 않았다. 무엇이 돌고 있는지 볼 곳도 없었다.
 *
 * 일감 목록을 셸에 둔다. 셸은 화면을 옮겨도 살아 있으므로, 목록을 들고 있는
 * 쪽이 회수를 계속한다. 목록은 브라우저에 저장해 새로고침도 넘긴다.
 *
 * 이 파일은 목록을 다루기만 한다. 언제 물어볼지는 쓰는 쪽 사정이다.
 */

export type RunningTool = "sns" | "poster";

export interface RunningJob {
  /** `도구:프로젝트`. 카드뉴스와 포스터가 같은 id 를 쓸 수 있다. */
  id: string;
  tool: RunningTool;
  title: string;
  /** 이 일감의 화면. 그 화면에 있는 동안에는 화면이 직접 물어보므로 쉰다. */
  href: string;
  startedAt: number;
  /** 상태를 물어볼 곳. 포스터는 어떤 요청인지 몸통에 실어야 한다. */
  poll: { url: string; body?: unknown };
}

/**
 * 목록에서 일감을 걷어 내는 마지막 그물. **큐의 마감과 다른 것을 잰다.**
 *
 * 예전에는 30분이었고 주석은 「큐가 포기하는 시각과 맞춘다」였다. 그런데
 * `QUEUE_GIVE_UP_MS` 는 **fal 요청 하나**의 경과 시간이고, 여기서 재는 것은
 * **생성을 시작한 시각**이다. 칸이 셋인 세트 여덟 장이면 fal 요청이 스물넷이라
 * 30분을 쉽게 넘기는데, 그때 목록에서 지워지면 폴링이 완전히 멈춰 남은 카드는
 * 제출도 회수도 안 되고 예약도 확정되지 않았다. 30분 넘게 돈 작업을 새로
 * 열었을 때는 첫 tick 에 바로 지워져 백그라운드 회수가 아예 시작되지 않았다.
 *
 * 정상적으로 끝난 일감은 서버 응답으로 지워지고, 사라진 프로젝트는 404 로
 * 지워진다. 이 값은 그 둘 다 안 걸리는 유령만 치우는 넉넉한 상한이다.
 */
export const JOB_GIVE_UP_MS = 4 * 60 * 60_000;

export const JOB_POLL_INTERVAL_MS = 10_000;

export const RUNNING_JOBS_KEY = "fixup:running-jobs";

const JobSchema = z.object({
  id: z.string().min(1),
  tool: z.enum(["sns", "poster"]),
  title: z.string(),
  href: z.string().min(1),
  startedAt: z.number(),
  poll: z.object({ url: z.string().min(1), body: z.unknown().optional() }),
});

export function jobId(tool: RunningTool, projectId: string): string {
  return `${tool}:${projectId}`;
}

export function upsertJob(jobs: RunningJob[], job: RunningJob): RunningJob[] {
  const without = jobs.filter((entry) => entry.id !== job.id);
  return [...without, job];
}

/**
 * 바뀐 것이 없으면 **받은 배열을 그대로 돌려준다.**
 *
 * 이 목록은 앱 전체를 감싸는 자리에 있다. 10초마다 새 배열을 만들면 아무
 * 일이 없어도 모든 화면이 다시 그려진다.
 */
function sameOrNext(jobs: RunningJob[], next: RunningJob[]): RunningJob[] {
  return next.length === jobs.length ? jobs : next;
}

export function removeJob(jobs: RunningJob[], id: string): RunningJob[] {
  return sameOrNext(jobs, jobs.filter((entry) => entry.id !== id));
}

/** 탭을 닫아 끝을 못 본 일감이 영원히 남지 않게 한다. */
export function pruneJobs(jobs: RunningJob[], now: number): RunningJob[] {
  return sameOrNext(jobs, jobs.filter((entry) => now - entry.startedAt < JOB_GIVE_UP_MS));
}

/**
 * 끝났나.
 *
 * 도구마다 대답이 다르게 생겼다. 포스터는 `done`, 카드뉴스는 `active`.
 * 어느 쪽이든 **서버가 판단해서 알려 준다** — 화면이 흐름을 뜯어 보고
 * 스스로 판단하게 두면 판단 기준이 두 곳에 생긴다.
 */
export function jobDone(payload: unknown): boolean {
  const value = payload as { done?: unknown; active?: unknown } | null;
  return value?.done === true || value?.active === false;
}

/** 브라우저에 저장해 둔 것은 믿지 않는다. 사람이 고칠 수 있고 옛 판이 남는다. */
export function parseJobs(raw: unknown): RunningJob[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = JobSchema.safeParse(entry);
    return parsed.success ? [parsed.data as RunningJob] : [];
  });
}
